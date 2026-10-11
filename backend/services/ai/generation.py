"""What the AI routes actually do, with no HTTP in sight.

Each function takes a request model and a credential set, and returns the data
the route will send. The route layer is left with reading three headers and
choosing a response class — which is why the AI surface no longer needs a
service of its own, or the network hop that used to reach it.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any, List

from ...core.errors import AppError
from ...schemas.ai import (
    GenerateSectionRequest,
    OutlineFromDocumentRequest,
    RefineOutlineRequest,
    SearchTopicsRequest,
    SourcesRequest,
    TransformRequest,
)
from .crawl import crawl_for_topic, crawl_pages, relevant_passages, search_sources
from .prompts import (
    outline_from_document_prompt,
    refine_outline_prompt,
    section_prompt,
    strip_fences,
    strip_wrappers,
    topic_hierarchy_prompt,
    transform_prompt,
    trim_echo,
)
from .shape import shape_fragment, shape_section
from .providers import AiCredentials, check_credentials, endpoint, generate_content, list_models

logger = logging.getLogger(__name__)


# ── Parsing what the model sent back ─────────────────────────────────────
def _extract_json(text: str) -> Any:
    """The first complete JSON value in `text`, wherever it sits.

    Models wrap JSON in fences, open with "Here is the outline:", close with
    a note, or leave a trailing comma — and some return nothing in `content`
    at all. The scan finds the first `{` or `[` and walks to the bracket that
    balances it, skipping brackets inside strings, so surrounding prose is
    ignored instead of fatal. Trailing commas are removed before parsing.
    """
    raw = (text or "").strip()
    if not raw:
        raise json.JSONDecodeError("the model returned an empty answer", raw, 0)
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass
    start = next((i for i, ch in enumerate(raw) if ch in "[{"), -1)
    if start < 0:
        raise json.JSONDecodeError("no JSON in the answer", raw, 0)
    depth = 0
    in_string = escaped = False
    for i in range(start, len(raw)):
        ch = raw[i]
        if in_string:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
        elif ch in "[{":
            depth += 1
        elif ch in "]}":
            depth -= 1
            if depth == 0:
                chunk = re.sub(r",\s*([\]}])", r"\1", raw[start:i + 1])
                return json.loads(chunk)
    raise json.JSONDecodeError("the JSON in the answer is cut off", raw, len(raw))


def _parse_topic_json(text: str) -> List[dict]:
    """A hierarchy the model returned, as a list of topic objects.

    The shape is checked rather than assumed: a bare string or an object of the
    wrong shape is a malformed answer (502, try again), not a 500.
    """
    parsed = _extract_json(text)

    # The prompt asks for {"topics": [...]} (JSON mode needs an object); older
    # answers and some models send the bare list.
    if isinstance(parsed, dict):
        for key in ("topics", "outline", "hierarchy", "data"):
            if isinstance(parsed.get(key), list):
                parsed = parsed[key]
                break

    if not isinstance(parsed, list) or not all(isinstance(item, dict) for item in parsed):
        raise json.JSONDecodeError("expected a list of topic objects", str(text)[:200], 0)

    for i, item in enumerate(parsed):
        item.setdefault("relevanceScore", max(60, 95 - i * 5))
    return parsed


def _parse_json_object(text: str) -> dict:
    """A JSON object the model returned, wherever in its answer it sits."""
    parsed = _extract_json(text)
    if not isinstance(parsed, dict):
        raise json.JSONDecodeError("expected a JSON object", str(text)[:200], 0)
    return parsed


_JSON_RETRY = (
    "\n\nIMPORTANT: your previous answer could not be read as JSON ({error}). Answer again with "
    "ONLY the JSON value — no prose, no code fence — and keep it short enough to finish."
)


async def _json_answer(prompt: str, credentials: AiCredentials, parse):
    """Ask for JSON, parse it, and ask once more — sternly — if it does not parse."""
    text = await generate_content(prompt, credentials, json_mode=True)
    try:
        return parse(text)
    except json.JSONDecodeError as first:
        logger.info("JSON answer did not parse (%s); asking again", first)
        text = await generate_content(prompt + _JSON_RETRY.format(error=first.msg), credentials, json_mode=True)
        return parse(text)


def _hierarchy_envelope(parsed: List[dict]) -> dict[str, Any]:
    """The shape the frontend expects for both hierarchy endpoints."""
    return {
        "status": "success",
        "data": {"topics": "```json\n" + json.dumps(parsed, indent=2) + "\n```"},
    }


# ── Topic hierarchies ────────────────────────────────────────────────────
@endpoint
async def search_topics(req: SearchTopicsRequest, *, credentials: AiCredentials) -> dict:
    return _hierarchy_envelope(await _json_answer(topic_hierarchy_prompt(req.query), credentials, _parse_topic_json))


@endpoint
async def verify_key(*, credentials: AiCredentials) -> None:
    """Check a key and model before the browser saves them."""
    await check_credentials(credentials)


@endpoint
async def models(*, credentials: AiCredentials) -> dict:
    """The chat models a key can use, so the picker never offers a retired one."""
    return {"models": await list_models(credentials)}


@endpoint
async def outline_from_document(
    req: OutlineFromDocumentRequest, *, credentials: AiCredentials
) -> dict:
    """Derive an outline from a draft the writer already has open."""
    return _hierarchy_envelope(await _json_answer(
        outline_from_document_prompt(req.document, req.format), credentials, _parse_topic_json,
    ))


@endpoint
async def refine_outline(req: RefineOutlineRequest, *, credentials: AiCredentials) -> dict:
    """Reorganise an outline and report what moved, and why.

    The rewritten outline is returned next to its reasoning rather than applied
    for the caller: the editor shows both and lets the writer decide, because a
    restructure that lands silently is one nobody can check.
    """
    indented = "\n".join(
        "  " * max(node.level - 1, 0)
        + "- "
        + node.title
        + (f"  [{node.words} words written]" if node.words else "")
        for node in req.outline
        if node.title.strip()
    )
    if not indented:
        raise AppError("There is no outline to refine yet.", 400)

    parsed = await _json_answer(
        refine_outline_prompt(indented, req.subject or "", req.instruction or ""),
        credentials,
        _parse_json_object,
    )

    outline = [
        {"title": str(row.get("title", "")).strip(), "level": int(row.get("level", 1) or 1)}
        for row in parsed.get("outline", [])
        if str(row.get("title", "")).strip()
    ]
    if not outline:
        raise AppError("The model returned an empty outline. Try again.", 502)

    changes = [
        {
            "title": str(row.get("title", "")).strip(),
            "kind": str(row.get("kind", "moved")).strip().lower(),
            "reason": str(row.get("reason", "")).strip(),
        }
        for row in parsed.get("changes", [])
        if str(row.get("title", "")).strip()
    ]
    return {
        "summary": str(parsed.get("summary", "")).strip(),
        "outline": outline,
        "changes": changes,
    }


# ── Long-form generation ─────────────────────────────────────────────────
async def _grounding(req: GenerateSectionRequest) -> str:
    """The reference material a section is written from.

    The pages on the writer's context shelf, cut down to the passages about
    this section (its title and the headings above it) — a thin, relevant
    excerpt rather than five whole pages per section. Nothing on the shelf
    means the model writes from its own knowledge. "web" is the old
    Wikipedia-for-the-topic mode, still honoured for older clients.
    """
    if req.source == "web":
        return await crawl_for_topic(req.topic)
    if not req.urls:
        return ""
    pages = [page for page in await crawl_pages(req.urls[:8]) if page]
    if not pages:
        return ""
    focus = " ".join([req.topic, *(req.ancestors or []), req.main_topic])
    return relevant_passages(pages, focus)


@endpoint
async def sources(req: SourcesRequest) -> dict:
    """Pages worth putting on the context shelf for a subject."""
    query = req.query.strip()
    if not query:
        raise AppError("Name a subject to find sources for.", 400)
    found = await search_sources(query, max(1, min(req.limit, 8)))
    if not found:
        raise AppError("The search returned nothing usable. Try different words.", 502)
    return {"sources": found}


@endpoint
async def generate_section(req: GenerateSectionRequest, *, credentials: AiCredentials) -> str:
    """Write one section of a document, in the format the document is in.

    This replaced six endpoints that differed only in output format and in
    where the reference material came from. Both are request fields now, so
    MDX and LaTeX cannot drift apart, and a fix to one grounding mode reaches
    every format that uses it.
    """
    prompt = section_prompt(
        req.format,
        req.topic,
        req.main_topic,
        context=await _grounding(req),
        hierarchy=req.hierarchy or "",
        children=req.children,
        ancestors=req.ancestors,
        section_number=req.section_number or "",
        level=req.level,
        instruction=req.instruction or "",
        style_sample=req.style_sample or "",
        lead_in=req.lead_in or "",
        labels=req.labels,
    )
    text = strip_fences((await generate_content(prompt, credentials)).strip(), req.format)
    # Atomic and renderable, whatever the model did: nothing at or above
    # this heading's level, an introduction only where sub-sections exist.
    return shape_section(text, req.format, level=req.level, title=req.topic, has_children=bool(req.children))


# ── Inline editing — the selection actions in the editor ─────────────────
@endpoint
async def transform(req: TransformRequest, *, credentials: AiCredentials) -> str:
    """Rewrite, extend, or explain one passage of a document in place."""
    prompt = transform_prompt(
        action=req.action,
        fmt=req.format,
        selection=req.selection,
        instruction=req.instruction or "",
        before=req.before or "",
        after=req.after or "",
        title=req.title or "",
        section=req.section or "",
        outline=req.outline or "",
        previous=req.previous or "",
        labels=req.labels,
    )
    text = strip_wrappers(strip_fences(await generate_content(prompt, credentials), req.format))
    if req.action == "continue":
        text = trim_echo(req.before or req.selection, text)
    return shape_fragment(text, req.format, floor=req.level)
