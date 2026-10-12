"""Making model output fit the document it is going into.

A prompt asks; this enforces. Whatever a model returns for a section is put
through here before it reaches the editor, so two promises hold no matter
which provider wrote it:

- **Sections are atomic.** Text written under a heading may add deeper
  headings of its own, but never one at the same level or above — that would
  split the section, or close its parent, and corrupt the outline. A section
  whose sub-sections already exist gets an introduction only: the text stops
  at the first heading, so a child is never written twice.
- **It renders.** Topical's renderers draw a subset of LaTeX and Markdown.
  Preambles, unclosed environments, unbalanced `$`, `\\(…\\)` in Markdown, a
  bare `|` inside maths in a table row and the like are repaired here rather
  than shown to the writer as red issues.
- **It reads as written, not generated.** Non-breaking hyphens and invisible
  characters, a "Sure, here is…" opener, self-numbered headings ("### 3.1 …",
  which clash with the outline's own numbers), and a closing "Summary" or
  "Key takeaways" block that restates the section are removed.

Pure functions over strings; no model, no I/O.
"""

from __future__ import annotations

import re
from typing import List, Optional, Tuple

_LATEX_LEVELS = {"part": 1, "chapter": 1, "section": 1, "subsection": 2, "subsubsection": 3,
                 "paragraph": 4, "subparagraph": 5}
_LATEX_BY_LEVEL = ["section", "subsection", "subsubsection", "paragraph", "subparagraph"]
_MAX_LEVEL = {"mdx": 6, "latex": 5}

_MDX_HEADING = re.compile(r"^(\s{0,3})(#{1,6})\s+(.*?)\s*#*\s*$")
_LATEX_HEADING = re.compile(r"^\s*\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\*?\s*\{(.*)\}\s*$")


def _norm(title: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", title.lower()).strip()


def _heading(line: str, fmt: str) -> Optional[Tuple[int, str]]:
    if fmt == "latex":
        m = _LATEX_HEADING.match(line)
        return (_LATEX_LEVELS[m.group(1)], m.group(2).strip()) if m else None
    m = _MDX_HEADING.match(line)
    return (len(m.group(2)), m.group(3).strip()) if m else None


#: A heading's own numbering — "3.1 ", "2. " — which the outline supplies already. Numbers only:
#: a letter-dot ("C. elegans") is as likely a name as a numeral.
#: "3.1 " and "2. " are numbering; "2048 bits" is a title.
_HEADING_NUMBER = re.compile(r"^(?:\d+(?:\.\d+)+\.?|\d+\.)\s+(?=\S)")


def unnumber(title: str) -> str:
    """A generated heading without the numbering the model gave it."""
    return _HEADING_NUMBER.sub("", title.strip()).strip() or title.strip()


def heading_line(title: str, level: int, fmt: str) -> str:
    """A heading at `level`, or bold text when the format has no level that deep."""
    if level > _MAX_LEVEL.get(fmt, 6):
        return f"\\textbf{{{title}}}" if fmt == "latex" else f"**{title}**"
    if fmt == "latex":
        return f"\\{_LATEX_BY_LEVEL[level - 1]}{{{title}}}"
    return "#" * level + " " + title


def floor_headings(text: str, fmt: str, floor: int, *, stop_at_first: bool = False,
                   title: str = "") -> str:
    """Keep every heading in `text` deeper than `floor`.

    A heading at or above the floor is demoted to `floor + 1`, keeping its
    words. A leading heading that repeats `title` is left alone — the caller
    strips it, since the document already has that heading. With
    `stop_at_first`, the text ends at the first other heading: an
    introduction above existing sub-sections must not grow sections of its own.
    """
    out: List[str] = []
    in_fence = False
    seen_text = False
    for line in text.split("\n"):
        if fmt == "mdx" and line.lstrip().startswith("```"):
            in_fence = not in_fence
        if not in_fence:
            found = _heading(line, fmt)
            if found:
                level, words = found
                if not seen_text and title and _norm(words) == _norm(title):
                    out.append(line)
                    continue
                if stop_at_first:
                    break
                bare = unnumber(words)
                if level <= floor:
                    line = heading_line(bare, floor + 1, fmt)
                elif bare != words:
                    line = heading_line(bare, level, fmt)
        if line.strip():
            seen_text = True
        out.append(line)
    return "\n".join(out).rstrip()


# ── LaTeX ──────────────────────────────────────────────────────────────────
_PREAMBLE = re.compile(
    r"^\s*\\(documentclass|usepackage|begin\{document\}|end\{document\}|maketitle|title\{|author\{|date\{|"
    r"newtheorem|geometry|pagestyle|tableofcontents).*$",
    re.MULTILINE,
)
_ENV = re.compile(r"\\(begin|end)\{([^}]+)\}")


def balance_latex(text: str) -> str:
    """Drop the preamble; close what was opened; discard what was never opened."""
    text = _PREAMBLE.sub("", text)

    out: List[str] = []
    stack: List[str] = []
    pos = 0
    for m in _ENV.finditer(text):
        kind, name = m.group(1), m.group(2)
        if kind == "begin":
            stack.append(name)
            continue
        if name in stack:
            # Close anything opened inside it that the model forgot first.
            while stack and stack[-1] != name:
                out.append(text[pos:m.start()] + f"\\end{{{stack.pop()}}}\n")
                pos = m.start()
            stack.pop()
        else:
            out.append(text[pos:m.start()])  # a stray \end: dropped
            pos = m.end()
    out.append(text[pos:])
    text = "".join(out)
    for name in reversed(stack):
        text = text.rstrip() + f"\n\\end{{{name}}}"

    text = _close_dollars(text)
    depth = _brace_depth(text)
    if depth > 0:
        text += "}" * depth
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def _brace_depth(text: str) -> int:
    depth = 0
    escaped = False
    for ch in text:
        if escaped:
            escaped = False
        elif ch == "\\":
            escaped = True
        elif ch == "{":
            depth += 1
        elif ch == "}" and depth > 0:
            depth -= 1
    return depth


def _close_dollars(text: str) -> str:
    """Close an unpaired $$ (whole text) or $ (per paragraph), which would swallow what follows.

    A lone `$` is closed at the end of its own paragraph, where the maths it
    opened most plausibly ends — not at the end of the section.
    """
    if re.sub(r"\\\$", "", text).count("$$") % 2:
        text = text.rstrip() + "\n$$"
    paragraphs = re.split(r"(\n\s*\n)", text)
    for i in range(0, len(paragraphs), 2):
        bare = re.sub(r"\\\$", "", paragraphs[i]).replace("$$", "")
        if bare.count("$") % 2:
            paragraphs[i] = paragraphs[i].rstrip() + "$"
    return "".join(paragraphs)


# ── Characters ─────────────────────────────────────────────────────────────
#: What some models emit for ordinary punctuation. A non-breaking hyphen looks
#: like "-" but is not one, so find, spellcheck and search all miss
#: "depth‑first"; the invisible ones break word counts and diffs.
_CHARACTERS = str.maketrans({
    "\u2010": "-", "\u2011": "-", "\u2012": "-",
    "\u00a0": " ", "\u202f": " ", "\u2007": " ", "\u2009": " ", "\u200a": " ",
    "\u200b": "", "\u200c": "", "\u200d": "", "\u2060": "", "\ufeff": "",
})

#: An opener addressed to the person who asked, not to the reader: assistant
#: small talk ("Sure!", "Certainly —"), or a line announcing what follows
#: ("Here is the section on X:"). "Here's why this matters." is prose, and stays.
_SMALL_TALK = re.compile(r"^\s*(?:sure|certainly|of course|okay|ok|absolutely|great|as requested)\b.{0,200}$", re.I)
_ANNOUNCES = re.compile(
    r"^\s*(?:here(?:'s|’s| is| are)|below is|the following is)\b.{0,200}?"
    r"\b(?:section|content|draft|text|version|rewrite|introduction|opening|markdown|mdx|latex)\b.{0,80}:\s*$",
    re.I,
)


def clean_characters(text: str) -> str:
    return text.translate(_CHARACTERS).replace("\r\n", "\n")


def drop_preamble(text: str) -> str:
    """Remove a "Sure — here is the section:" first line, when something follows it."""
    lines = text.lstrip("\n").split("\n")
    first = lines[0]
    if len(lines) > 1 and (_SMALL_TALK.match(first) or _ANNOUNCES.match(first)) and "".join(lines[1:]).strip():
        return "\n".join(lines[1:]).lstrip("\n")
    return text


# ── Markdown ───────────────────────────────────────────────────────────────
_FRONTMATTER = re.compile(r"\A---\s*\n.*?\n---\s*\n", re.DOTALL)
_IMPORT_EXPORT = re.compile(r"^\s*(import|export)\s.+$", re.MULTILINE)
#: A component tag, anywhere on a line: `<Callout type="x">`, `</Callout>`, `<Chart />`.
_JSX_TAG = re.compile(r"</?[A-Z][A-Za-z0-9.]*(\s[^<>]*)?/?>")
#: Inline HTML the renderer would show as literal tags, and what it means in Markdown.
_HTML_PAIRS = [
    (re.compile(r"<(b|strong)>(.+?)</\1>", re.IGNORECASE), r"**\2**"),
    (re.compile(r"<(i|em)>(.+?)</\1>", re.IGNORECASE), r"*\2*"),
    (re.compile(r"<code>(.+?)</code>", re.IGNORECASE), r"`\1`"),
    (re.compile(r"<sup>(.+?)</sup>", re.IGNORECASE), r"$^{\1}$"),
    (re.compile(r"<sub>(.+?)</sub>", re.IGNORECASE), r"$_{\1}$"),
]
_HTML_TAG = re.compile(r"</?(?:span|div|p|font|u|small|mark|center)\b[^<>]*>", re.IGNORECASE)
_BR = re.compile(r"<br\s*/?>", re.IGNORECASE)
_BULLET_STAR = re.compile(r"^(\s*)\*(\s+)(?=\S)", re.MULTILINE)


def _code_spans(line: str) -> List[Tuple[int, int]]:
    """Where inline code sits in a line, as (start, end) — backtick runs of equal length."""
    spans: List[Tuple[int, int]] = []
    i = 0
    while i < len(line):
        if line[i] == "`":
            run = len(line[i:]) - len(line[i:].lstrip("`"))
            close = line.find("`" * run, i + run)
            if close < 0:
                break
            spans.append((i, close + run))
            i = close + run
        else:
            i += 1
    return spans


def math_spans(line: str) -> List[Tuple[int, int]]:
    """Inline `$…$` in one line, as (start, end) including the dollars.

    Pandoc's rule, so prices are not maths: an opening `$` has a non-space
    after it, a closing `$` has a non-space before it and no digit after it.
    `$5 and $10` is text; `$|V|$` is maths. Code spans and `\\$` are skipped.
    """
    code = _code_spans(line)
    in_code = lambda i: any(a <= i < b for a, b in code)  # noqa: E731
    spans: List[Tuple[int, int]] = []
    i, n = 0, len(line)
    while i < n:
        ch = line[i]
        if ch == "\\":
            i += 2
            continue
        if ch == "$" and not in_code(i):
            if line.startswith("$$", i):
                close = line.find("$$", i + 2)
                if close > i + 2:
                    spans.append((i, close + 2))
                    i = close + 2
                    continue
                i += 2
                continue
            if i + 1 < n and not line[i + 1].isspace():
                j = i + 1
                while j < n:
                    if line[j] == "\\":
                        j += 2
                        continue
                    if line[j] == "$" and not line[j - 1].isspace() and not (j + 1 < n and line[j + 1].isdigit()):
                        break
                    j += 1
                if j < n:
                    spans.append((i, j + 1))
                    i = j + 1
                    continue
        i += 1
    return spans


def _vert(line: str, at: int, word: str) -> str:
    """`\\vert`, with a space when a letter follows (`\\vert V`, not `\\vertV`)."""
    return word + (" " if at < len(line) and line[at].isalpha() else "")


def table_row_pipes(line: str) -> str:
    """Make a table row's only `|` characters its cell borders.

    GFM splits a row on every unescaped `|` before maths or code is read, so
    `$|V|\\ge 3$` became three cells and the table grew columns. In maths
    a bar is written `\\vert` (`\\Vert` for `\\|`); in code, escaped.
    """
    if not line.lstrip().startswith("|"):
        return line
    maths = math_spans(line)
    code = _code_spans(line)
    if not maths and not code:
        return line
    out: List[str] = []
    i = 0
    while i < len(line):
        in_math = any(a < i < b - 1 for a, b in maths)
        in_code = any(a < i < b - 1 for a, b in code)
        if in_math and line.startswith("\\|", i):
            out.append(_vert(line, i + 2, "\\Vert"))
            i += 2
            continue
        if line[i] == "\\":
            out.append(line[i:i + 2])
            i += 2
            continue
        if line[i] == "|" and in_math:
            out.append(_vert(line, i + 1, "\\vert"))
        elif line[i] == "|" and in_code:
            out.append("\\|")
        else:
            out.append(line[i])
        i += 1
    return "".join(out)


def _tidy_prose_line(line: str, in_table: bool) -> str:
    """Inline HTML into Markdown, outside code spans."""
    if "<" not in line:
        return line
    code = _code_spans(line)
    pieces, last = [], 0
    for a, b in code + [(len(line), len(line))]:
        chunk = line[last:a]
        for pattern, repl in _HTML_PAIRS:
            chunk = pattern.sub(repl, chunk)
        chunk = _BR.sub("; " if in_table else "\n", chunk)
        chunk = _HTML_TAG.sub("", chunk)
        pieces.append(chunk + line[a:b])
        last = b
    return "".join(pieces)


def tidy_mdx(text: str) -> str:
    """What react-markdown + KaTeX cannot draw, rewritten into what it can."""
    text = _FRONTMATTER.sub("", text)
    parts = re.split(r"(^\s*```.*?^\s*```\s*$)", text, flags=re.MULTILINE | re.DOTALL)
    for i in range(0, len(parts), 2):  # prose only, never inside code fences
        chunk = _IMPORT_EXPORT.sub("", parts[i])
        chunk = _JSX_TAG.sub("", chunk)
        chunk = re.sub(r"\\\[(.+?)\\\]", lambda m: "\n$$\n" + m.group(1).strip() + "\n$$\n", chunk, flags=re.DOTALL)
        chunk = re.sub(r"\\\((.+?)\\\)", lambda m: "$" + m.group(1).strip() + "$", chunk, flags=re.DOTALL)
        # KaTeX has no \label; in Markdown there is nothing for it to label.
        chunk = re.sub(r"\\label\{[^{}]*\}", "", chunk)
        chunk = _BULLET_STAR.sub(r"\1-\2", chunk)
        lines = []
        for line in chunk.split("\n"):
            row = line.lstrip().startswith("|")
            line = _tidy_prose_line(line, row).rstrip()
            lines.append(table_row_pipes(line) if row else line)
        parts[i] = "\n".join(lines)
    text = "".join(parts)
    if len(re.findall(r"^\s*```", text, flags=re.MULTILINE)) % 2:
        text = text.rstrip() + "\n```"
    text = _close_dollars(text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def render_safe(text: str, fmt: str) -> str:
    text = clean_characters(text)
    if fmt == "latex":
        text = "\n".join(line.rstrip() for line in text.split("\n"))
        return balance_latex(text)
    return tidy_mdx(text)


# ── Endings ────────────────────────────────────────────────────────────────
#: Titles of a block that only restates the section above it.
_RECAP_TITLES = {
    "summary", "in summary", "key takeaways", "takeaways", "take aways", "key points", "conclusion",
    "conclusions", "recap", "wrap up", "wrapping up", "final thoughts", "key ideas", "what to remember",
    "summary of key points", "key insights", "the big picture",
}
_RECAP_OPENER = re.compile(r"^\s*(?:in summary|in conclusion|to summari[sz]e|to sum up|in short|in a nutshell)\b", re.I)
#: How much a section must say before a recap is cut — a short section's last paragraph may be all it has.
_RECAP_MIN_WORDS = 80


def _words(text: str) -> int:
    return len(re.findall(r"[A-Za-z0-9]+", text))


def drop_recap(text: str, fmt: str) -> str:
    """Cut a closing summary: a "Summary"/"Key takeaways" block, or an "In summary," paragraph.

    Every section ending in its own recap made the document say everything
    twice, the second time in bullet points.
    """
    lines = text.split("\n")
    last_heading = None
    in_fence = False
    for i, line in enumerate(lines):
        if fmt == "mdx" and line.lstrip().startswith("```"):
            in_fence = not in_fence
        if not in_fence and _heading(line, fmt):
            last_heading = i
    if last_heading is not None:
        title = re.sub(r"[^a-z ]+", " ", unnumber(_heading(lines[last_heading], fmt)[1]).lower())
        title = re.sub(r"\s+", " ", title).strip()
        before = "\n".join(lines[:last_heading])
        if title in _RECAP_TITLES and _words(before) >= _RECAP_MIN_WORDS:
            return before.rstrip()

    paragraphs = re.split(r"\n\s*\n", text.rstrip())
    if len(paragraphs) >= 3 and _RECAP_OPENER.match(paragraphs[-1]) and _words("\n".join(paragraphs[:-1])) >= _RECAP_MIN_WORDS:
        return "\n\n".join(paragraphs[:-1]).rstrip()
    return text


def drop_trailing_heading(text: str, fmt: str) -> str:
    """A heading with nothing under it, at the very end, is a part the model never wrote."""
    lines = text.rstrip().split("\n")
    while lines and _heading(lines[-1], fmt) and len(lines) > 1:
        lines.pop()
        while lines and not lines[-1].strip():
            lines.pop()
    return "\n".join(lines)


def shape_section(text: str, fmt: str, *, level: int, title: str, has_children: bool) -> str:
    """A generated section, made to fit under its heading, to render, and to end where its content does."""
    text = drop_preamble(clean_characters(text))
    text = render_safe(text, fmt)
    text = floor_headings(text, fmt, level, stop_at_first=has_children, title=title)
    text = drop_recap(text, fmt)
    return drop_trailing_heading(text, fmt)


def shape_fragment(text: str, fmt: str, *, floor: Optional[int]) -> str:
    """An inline edit: renders, and adds no heading at or above its section's."""
    text = render_safe(drop_preamble(clean_characters(text)), fmt)
    return floor_headings(text, fmt, floor) if floor else text
