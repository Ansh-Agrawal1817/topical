"""Fetching the reference material a grounded section is written from.

Two strategies, in order of preference: crawl4ai when it is importable (Python
3.10+ with the headless browser installed), and a urllib + BeautifulSoup fetch
otherwise — so a missing browser degrades to plain text rather than failing the
request.

Everything here is called from async request handlers, so every blocking call
is pushed to a worker thread. urllib is synchronous, and awaiting it inline
would stall *every* concurrent request for the length of a page load — the same
reason `generate_content` in `providers.py` is async all the way down.

Failure is a return of `None`, never a string. A "[Failed to fetch …]"
placeholder used to be returned instead and then string-matched by the callers
to decide whether the fetch had worked, which meant a page that merely
contained that phrase counted as a failure, and a caller that forgot the check
passed the placeholder to the model as if it were research.
"""

import asyncio
import ipaddress
import json
import logging
import re
import socket
import ssl
import time
import urllib.parse
import urllib.error
import urllib.request
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

#: Per-page cap. Enough for a long article, short of blowing the context window.
MAX_PAGE_CHARS = 15_000
#: Below this, a "successful" fetch is a cookie wall or an error page.
MIN_USEFUL_CHARS = 200

_FETCH_TIMEOUT_SECONDS = 30
_MAX_RESPONSE_BYTES = 5 * 1024 * 1024
_SUMMARY_TIMEOUT_SECONDS = 15

_BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}


# ---------------------------------------------------------------------------
# Which addresses may be fetched
# ---------------------------------------------------------------------------
def _is_public_host(host: str) -> bool:
    """Whether every address ``host`` resolves to is on the public internet."""
    if not host:
        return False
    try:
        infos = socket.getaddrinfo(host, None)
    except OSError:
        return False
    for info in infos:
        address = ipaddress.ip_address(info[4][0].split("%", 1)[0])
        if not address.is_global or address.is_multicast:
            return False
    return bool(infos)


def is_fetchable(url: str) -> bool:
    """Whether the server may fetch ``url`` on a writer's behalf.

    The URLs here come from the writer — pasted into Context — and the server
    fetches them from inside its own network. Without this, any signed-in user
    could point it at ``localhost``, the hosting provider's private network or
    its metadata endpoint (``169.254.169.254``) and read the answer back in a
    generated section. Only public http(s) addresses are allowed, checked
    after DNS resolution, and again for every redirect.
    """
    try:
        parts = urllib.parse.urlsplit(url)
    except ValueError:
        return False
    return parts.scheme in ("http", "https") and _is_public_host(parts.hostname or "")


class _PublicRedirects(urllib.request.HTTPRedirectHandler):
    """Follow a redirect only to another public address."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not is_fetchable(newurl):
            raise urllib.error.URLError(f"refused redirect to a non-public address: {newurl}")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


# ---------------------------------------------------------------------------
# One page
# ---------------------------------------------------------------------------
#: Pages read recently. A shelf of five sources grounds every section of a
#: batch; without this each section relaunched a browser for the same pages.
_PAGE_CACHE: Dict[str, Tuple[float, str]] = {}
_PAGE_TTL_SECONDS = 30 * 60


async def crawl_url(url: str) -> Optional[str]:
    """Readable text from one URL, or None if it cannot be read."""
    return (await crawl_pages([url]))[0]


async def crawl_pages(urls: List[str]) -> List[Optional[str]]:
    """Readable text from each URL, in order — None where a page could not be read.

    Recently read pages come from the cache. The rest share one browser: each
    used to be fetched with an ``AsyncWebCrawler`` of its own, so a section
    grounded in five pages started five headless Chromiums at once — seconds of
    startup apiece, and on a 1GB machine the difference between a slow request
    and an out-of-memory kill.
    """
    now = time.monotonic()
    texts: Dict[str, Optional[str]] = {}
    for url in urls:
        hit = _PAGE_CACHE.get(url)
        if hit and now - hit[0] < _PAGE_TTL_SECONDS:
            texts[url] = hit[1]
    missing = [url for url in dict.fromkeys(urls) if url not in texts]
    refused = [url for url in missing if not await asyncio.to_thread(is_fetchable, url)]
    for url in refused:
        logger.warning("refused to fetch a non-public address: %s", url)
        texts[url] = None
    missing = [url for url in missing if url not in refused]
    if missing:
        for url, text in zip(missing, await _crawl_many(missing)):
            texts[url] = text
            if text:
                if len(_PAGE_CACHE) > 200:
                    _PAGE_CACHE.clear()
                _PAGE_CACHE[url] = (time.monotonic(), text)
    return [texts.get(url) for url in urls]


async def _crawl_many(urls: List[str]) -> List[Optional[str]]:
    """Render each page in one shared browser; plain-fetch whatever that misses.

    crawl4ai renders the page in a real browser, which is the only way to get
    anything useful out of a client-rendered site. When it is unavailable or
    fails, the plain fetch still handles the server-rendered majority.
    """
    rendered: List[Optional[str]] = [None] * len(urls)
    try:
        from crawl4ai import AsyncWebCrawler

        async with AsyncWebCrawler() as crawler:
            results = await asyncio.gather(*(crawler.arun(url=url) for url in urls), return_exceptions=True)
        for i, result in enumerate(results):
            if isinstance(result, BaseException):
                logger.warning("crawl4ai failed for %s (%s); falling back", urls[i], result)
                continue
            # A browser follows redirects on its own; what it landed on is
            # held to the same rule as what it was asked for.
            landed = getattr(result, "redirected_url", None)
            if landed and landed != urls[i] and not await asyncio.to_thread(is_fetchable, landed):
                logger.warning("discarding %s: it redirected to a non-public address", urls[i])
                rendered[i] = ""
                continue
            if result and result.markdown:
                rendered[i] = result.markdown[:MAX_PAGE_CHARS]
    except (ImportError, TypeError):
        # crawl4ai unavailable (e.g. Python < 3.10) — degrade, don't fail.
        logger.warning("crawl4ai not available; falling back to a plain fetch")
    except Exception as exc:
        logger.warning("crawl4ai failed (%s); falling back to a plain fetch", exc)

    misses = [i for i, text in enumerate(rendered) if text is None]
    rendered = [text or None for text in rendered]
    fetched = await asyncio.gather(*(asyncio.to_thread(_fetch_text, urls[i]) for i in misses))
    for i, text in zip(misses, fetched):
        rendered[i] = text
    return rendered


def _fetch_text(url: str) -> Optional[str]:
    """Blocking fetch + text extraction. Always called via `asyncio.to_thread`."""
    try:
        html = _read(url, _BROWSER_HEADERS, _FETCH_TIMEOUT_SECONDS, permissive_tls=True)
        return _extract_text(html)
    except Exception as exc:
        logger.error("Could not fetch %s: %s", url, exc)
        return None


def _read(url: str, headers: dict, timeout: int, permissive_tls: bool = False) -> str:
    """Read a URL as text. Blocking.

    `permissive_tls` skips certificate verification, which is wrong in general
    and right here: the content is only ever read, summarised and shown to the
    person who asked for that exact URL, and a lapsed certificate on a source
    page is not a reason to refuse to read it.
    """
    context = None
    if permissive_tls:
        context = ssl.create_default_context()
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE

    request = urllib.request.Request(url, headers=headers)
    opener = urllib.request.build_opener(_PublicRedirects, urllib.request.HTTPSHandler(context=context))
    with opener.open(request, timeout=timeout) as response:
        # Capped: a page is read for a few thousand characters of prose, and
        # an endless or enormous response must not be held in memory whole.
        return response.read(_MAX_RESPONSE_BYTES).decode("utf-8", errors="ignore")


def _extract_text(html: str) -> Optional[str]:
    """Strip a page down to the prose, in the markdown-ish shape prompts expect."""
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "nav", "footer", "header"]):
        tag.decompose()

    # Blank line before each heading and paragraph, one line per list item —
    # without these the whole page collapses into a single run-on line.
    for tag in soup.find_all(["h1", "h2", "h3", "h4", "h5", "h6", "p"]):
        tag.insert_before("\n\n")
    for item in soup.find_all("li"):
        item.insert_before("\n- ")

    text = soup.get_text(separator=" ", strip=True)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    return text[:MAX_PAGE_CHARS] or None


# ---------------------------------------------------------------------------
# Topic research
# ---------------------------------------------------------------------------
async def crawl_for_topic(topic: str) -> str:
    """Research a topic on Wikipedia, falling back to its REST summary.

    The summary API is the fallback rather than the first choice because it
    returns one paragraph where the article gives a whole page — but one solid
    paragraph still beats the empty string, which is what the caller gets when
    a title does not resolve or the article is a stub.
    """
    slug = topic.replace(" ", "_")

    article = await crawl_url(f"https://en.wikipedia.org/wiki/{slug}")
    if article and len(article) > MIN_USEFUL_CHARS:
        return article

    summary = await asyncio.to_thread(_wikipedia_summary, slug, topic)
    return summary or article or ""


def _wikipedia_summary(slug: str, topic: str) -> Optional[str]:
    """The REST summary for a title, as a heading plus its extract. Blocking."""
    url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{slug}"
    try:
        raw = _read(url, {"User-Agent": "Topical/1.0"}, _SUMMARY_TIMEOUT_SECONDS)
        data = json.loads(raw)
    except Exception as exc:
        logger.info("No Wikipedia summary for %r: %s", topic, exc)
        return None

    extract = data.get("extract")
    return f"# {data.get('title', topic)}\n\n{extract}" if extract else None


# ---------------------------------------------------------------------------
# Finding sources — the context shelf's "top 5"
# ---------------------------------------------------------------------------
_SEARCH_URL = "https://html.duckduckgo.com/html/?q="
_SKIP_HOSTS = ("duckduckgo.com", "youtube.com", "facebook.com", "twitter.com", "x.com",
               "instagram.com", "tiktok.com", "pinterest.")


def _parse_results(html: str, limit: int) -> List[dict]:
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(html, "html.parser")
    found: List[dict] = []
    seen = set()
    for anchor in soup.select("a.result__a"):
        href = anchor.get("href", "")
        if "uddg=" in href:
            query = urllib.parse.parse_qs(urllib.parse.urlparse(href).query)
            href = urllib.parse.unquote(query.get("uddg", [""])[0])
        if not href.startswith("http"):
            continue
        host = urllib.parse.urlparse(href).netloc.lower()
        if any(skip in host for skip in _SKIP_HOSTS) or "/y.js" in href or host in seen:
            continue
        seen.add(host)
        result = anchor.find_parent(class_="result")
        snippet = result.select_one(".result__snippet") if result else None
        found.append({
            "url": href,
            "title": anchor.get_text(" ", strip=True),
            "snippet": snippet.get_text(" ", strip=True)[:240] if snippet else "",
        })
        if len(found) >= limit:
            break
    return found


async def search_sources(query: str, limit: int = 5) -> List[dict]:
    """The top pages for a subject, one per site, read from a web search.

    The results page is rendered by crawl4ai when it is available, like any
    other page here, and fetched plainly otherwise.
    """
    url = _SEARCH_URL + urllib.parse.quote(query)
    html: Optional[str] = None
    try:
        from crawl4ai import AsyncWebCrawler

        async with AsyncWebCrawler() as crawler:
            result = await crawler.arun(url=url)
            html = getattr(result, "html", None) if result else None
    except Exception as exc:  # unavailable or failed: the plain fetch below
        logger.info("crawl4ai search fell back to a plain fetch: %s", exc)
    if not html or "result__a" not in html:
        html = await asyncio.to_thread(_read, url, _BROWSER_HEADERS, _FETCH_TIMEOUT_SECONDS)
    return _parse_results(html or "", limit)


# ---------------------------------------------------------------------------
# Passages — the part of each source a section actually needs
# ---------------------------------------------------------------------------
_WORD = re.compile(r"[a-z0-9]{3,}")
_STOP = {"the", "and", "for", "with", "that", "this", "from", "are", "was", "how", "what",
         "why", "into", "its", "their", "about", "between", "using", "use", "vs"}


def relevant_passages(pages: List[str], focus: str, budget: int = 4000) -> str:
    """The paragraphs of `pages` most about `focus`, up to `budget` characters.

    Sending five whole pages to every section is slow, expensive, and buries
    the few paragraphs that matter: a section on "semantic chunking" needs the
    two paragraphs about semantic chunking, not the article's introduction.
    Paragraphs are scored by how many of the focus words they contain, and
    kept in their original order so they still read as text. The budget is
    about 1,000 tokens: the section's own facts, not the pages' surroundings.
    """
    terms = {w for w in _WORD.findall(focus.lower()) if w not in _STOP}
    scored: List[Tuple[int, int, int, str]] = []
    for p_index, page in enumerate(pages):
        for i, para in enumerate(p for p in re.split(r"\n\s*\n", page) if len(p.strip()) > 80):
            words = set(_WORD.findall(para.lower()))
            score = len(terms & words)
            if score:
                scored.append((score, p_index, i, para.strip()))
    if not scored:
        return "\n\n".join(pages)[:budget]
    keep: List[Tuple[int, int, str]] = []
    used = 0
    for score, p_index, i, para in sorted(scored, key=lambda row: -row[0]):
        if used + len(para) > budget:
            continue
        keep.append((p_index, i, para))
        used += len(para)
    return "\n\n".join(para for _, _, para in sorted(keep))
