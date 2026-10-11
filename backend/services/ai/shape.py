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
  Preambles, unclosed environments, unbalanced `$`, `\\(…\\)` in Markdown and the
  like are repaired here rather than shown to the writer as red issues.

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
                if level <= floor:
                    line = heading_line(words, floor + 1, fmt)
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


# ── Markdown ───────────────────────────────────────────────────────────────
_FRONTMATTER = re.compile(r"\A---\s*\n.*?\n---\s*\n", re.DOTALL)
_IMPORT_EXPORT = re.compile(r"^\s*(import|export)\s.+$", re.MULTILINE)
#: A component tag, anywhere on a line: `<Callout type="x">`, `</Callout>`, `<Chart />`.
_JSX_TAG = re.compile(r"</?[A-Z][A-Za-z0-9.]*(\s[^<>]*)?/?>")


def tidy_mdx(text: str) -> str:
    """What react-markdown + KaTeX cannot draw, rewritten into what it can."""
    text = _FRONTMATTER.sub("", text)
    parts = re.split(r"(^\s*```.*?^\s*```\s*$)", text, flags=re.MULTILINE | re.DOTALL)
    for i in range(0, len(parts), 2):  # prose only, never inside code fences
        chunk = _IMPORT_EXPORT.sub("", parts[i])
        chunk = _JSX_TAG.sub("", chunk)
        chunk = re.sub(r"\\\[(.+?)\\\]", lambda m: "\n$$\n" + m.group(1).strip() + "\n$$\n", chunk, flags=re.DOTALL)
        chunk = re.sub(r"\\\((.+?)\\\)", lambda m: "$" + m.group(1).strip() + "$", chunk, flags=re.DOTALL)
        parts[i] = chunk
    text = "".join(parts)
    if len(re.findall(r"^\s*```", text, flags=re.MULTILINE)) % 2:
        text = text.rstrip() + "\n```"
    text = _close_dollars(text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def render_safe(text: str, fmt: str) -> str:
    return balance_latex(text) if fmt == "latex" else tidy_mdx(text)


def shape_section(text: str, fmt: str, *, level: int, title: str, has_children: bool) -> str:
    """A generated section, made to fit under its heading and to render."""
    text = render_safe(text, fmt)
    return floor_headings(text, fmt, level, stop_at_first=has_children, title=title)


def shape_fragment(text: str, fmt: str, *, floor: Optional[int]) -> str:
    """An inline edit: renders, and adds no heading at or above its section's."""
    text = render_safe(text, fmt)
    return floor_headings(text, fmt, floor) if floor else text
