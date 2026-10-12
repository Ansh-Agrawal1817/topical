"""Checking a model's answer before it reaches the document.

``shape.py`` repairs what can be repaired without asking: headings that would
break the outline, maths that would not render, a recap at the end. What it
cannot repair is an answer that is not there — cut off at the token limit,
stopped mid-sentence, a refusal, a tenth of the length asked for, an
introduction that is really the whole chapter. Those are found here, and the
model is asked once more with the problems named.

Every check is a plain function over strings: no model, no I/O. An ``Issue``
is *serious* when the answer should not be used as it is; the rest are noted
in the log and left alone, because asking again costs a whole round trip
against a rate limit.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import List, Optional, Sequence, Tuple

from .shape import _code_spans, _heading, math_spans, unnumber


@dataclass(frozen=True)
class Issue:
    code: str
    #: Said to the model when it is asked again: what was wrong, and what to do instead.
    fix: str
    serious: bool = True


def _words(text: str) -> int:
    return len(re.findall(r"[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*", text))


def _prose(text: str, fmt: str) -> str:
    """The words a reader reads: no code, no display maths, no markup commands."""
    text = re.sub(r"```[\s\S]*?```", " ", text)
    text = re.sub(r"\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]", " ", text)
    if fmt == "latex":
        text = re.sub(r"\\begin\{(equation|align|gather)\*?\}[\s\S]*?\\end\{\1\*?\}", " ", text)
        text = re.sub(r"\\[a-zA-Z]+\*?", " ", text)
    return text


# ── Answers that are not the thing asked for ──────────────────────────────
_REFUSAL = re.compile(
    r"^\s*(?:i'?m sorry|i am sorry|i apologi[sz]e|i cannot|i can'?t|i won'?t|i'?m unable|i am unable|"
    r"as an ai|i do not have|i don'?t have)\b",
    re.I,
)

#: Talking to the reader about the document instead of writing it.
_FRAMING = re.compile(
    r"\b(?:in this section,? (?:we|i|you)\b|this section (?:will|aims to|explores|covers|introduces|discusses)\b|"
    r"we will (?:explore|discuss|cover|examine|look at|delve)\b|let'?s (?:dive|explore|take a (?:closer )?look|delve)\b)",
    re.I,
)

#: Phrases that mark text as generated. One is a habit; several are a voice.
STOCK_PHRASES = (
    "delve", "delves", "delving", "plays a crucial role", "plays a vital role", "plays a pivotal role",
    "in the realm of", "it is worth noting", "it's worth noting", "it is important to note",
    "it's important to note", "a testament to", "tapestry", "navigate the complexities",
    "in today's world", "in today's fast-paced", "ever-evolving", "unlock the", "unleash",
    "seamlessly", "embark on", "a myriad of", "the intricacies of", "rich landscape",
    "serves as a cornerstone", "stands as a", "game-changer", "at its core,",
)
_STOCK = re.compile(r"\b(?:" + "|".join(re.escape(p) for p in STOCK_PHRASES) + r")", re.I)
#: Distinct stock phrases that make an answer worth asking for again.
STOCK_LIMIT = 3


def refusal(text: str) -> Optional[Issue]:
    if _REFUSAL.match(text):
        return Issue("refusal", "You answered with a refusal or a note to the writer instead of the text. "
                                "Write the text itself.")
    return None


def stock_phrases(text: str) -> List[str]:
    return sorted({m.group(0).lower() for m in _STOCK.finditer(text)})


# ── How an answer ends ────────────────────────────────────────────────────
_CLOSERS = "*_)]}\"'”’»"


def _blocks(text: str, fmt: str) -> List[Tuple[str, str]]:
    """The text as (kind, block) — paragraph, list, table, code, maths, heading — in order."""
    out: List[Tuple[str, str]] = []
    lines = text.split("\n")
    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        if not stripped:
            i += 1
            continue
        fence = "```" if stripped.startswith("```") else "$$" if stripped == "$$" or (stripped.startswith("$$") and not stripped.endswith("$$")) else None
        if fence and fmt == "mdx":
            j = i + 1
            while j < len(lines) and not lines[j].strip().startswith(fence):
                j += 1
            out.append(("code" if fence == "```" else "math", "\n".join(lines[i:j + 1])))
            i = j + 1
            continue
        if _heading(line, fmt):
            out.append(("heading", line))
            i += 1
            continue
        j = i
        while j < len(lines) and lines[j].strip() and not _heading(lines[j], fmt):
            j += 1
        block = "\n".join(lines[i:j])
        first = lines[i].lstrip()
        if first.startswith("|"):
            kind = "table"
        elif re.match(r"(?:[-*+]|\d+[.)])\s", first):
            kind = "list"
        elif first.startswith("$$") and stripped.endswith("$$"):
            kind = "math"
        elif fmt == "latex" and re.match(r"\\(?:begin|end|item)\b", first):
            kind = "env"
        else:
            kind = "paragraph"
        out.append((kind, block))
        i = j
    return out


def unfinished_end(text: str, fmt: str) -> Optional[Issue]:
    """The last thing written stops mid-thought: on a comma, a colon with nothing after it, or mid-clause."""
    blocks = _blocks(text, fmt)
    if not blocks:
        return None
    kind, block = blocks[-1]
    last = block.strip().split("\n")[-1].strip()
    if kind == "heading":
        return Issue("ends-on-heading", "You ended on a heading with nothing under it. Finish every part you start.")
    if kind not in ("paragraph", "list"):
        return None
    tail = last.rstrip(_CLOSERS).rstrip()
    if not tail or tail.endswith(("$", "`", "}")) and kind == "paragraph":
        return None
    end = tail[-1]
    if end.isalnum():
        if kind == "list":
            return None  # "- Dense graphs" is a finished list item
        # A short last line missing its full stop is a typo; a long one that
        # trails off is an answer that stopped.
        fragment = re.split(r"[.!?…]\s", tail)[-1]
        if _words(fragment) < 6:
            return Issue("no-full-stop", "The last sentence has no full stop.", serious=False)
    if end.isalnum() or end in ",:;(-–—":
        return Issue(
            "unfinished",
            "Your answer stopped mid-sentence (it ended: \u201c…" + tail[-60:] + "\u201d). "
            "Write it again so every sentence, list and paragraph is complete.",
        )
    return None


def unbalanced(raw: str, fmt: str) -> Optional[Issue]:
    """Something opened and never closed — the usual sign the answer was cut short."""
    if fmt == "mdx":
        fences = len(re.findall(r"^\s*```", raw, flags=re.M))
        if fences % 2:
            return Issue("open-block", "A code block you opened was never closed. Close every block you open.")
        if re.sub(r"\\\$", "", raw).count("$$") % 2:
            return Issue("open-block", "A $$ display equation you opened was never closed.")
    else:
        opened = re.findall(r"\\begin\{([^}]+)\}", raw)
        closed = re.findall(r"\\end\{([^}]+)\}", raw)
        if len(opened) > len(closed):
            return Issue("open-block", f"\\begin{{{opened[-1]}}} was never closed with its \\end.")
    return None


# ── Tables ────────────────────────────────────────────────────────────────
def split_row(line: str) -> List[str]:
    """A GFM table row's cells, treating `|` inside maths, code or `\\|` as content."""
    row = line.strip()
    guarded = [*math_spans(row), *_code_spans(row)]
    cells, start, i = [], 0, 0
    while i < len(row):
        if row[i] == "\\":
            i += 2
            continue
        if row[i] == "|" and not any(a < i < b - 1 for a, b in guarded):
            cells.append(row[start:i])
            start = i + 1
        i += 1
    cells.append(row[start:])
    if row.startswith("|"):
        cells = cells[1:]
    if row.endswith("|") and not row.endswith("\\|"):
        cells = cells[:-1]
    return [cell.strip() for cell in cells]


def table_shape(text: str) -> Optional[Issue]:
    """A GFM table whose rows do not have as many cells as its header."""
    lines = text.split("\n")
    for i in range(len(lines) - 1):
        head, rule = lines[i].strip(), lines[i + 1].strip()
        if not (head.startswith("|") and re.fullmatch(r"\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?", rule)):
            continue
        width = len(split_row(head))
        j = i + 2
        while j < len(lines) and lines[j].strip().startswith("|"):
            if len(split_row(lines[j])) != width:
                return Issue(
                    "table-cells",
                    f"A table row has a different number of cells from its header ({width}). Every row needs "
                    "exactly one cell per column; write a | inside a cell as \\| (in maths, \\vert).",
                )
            j += 1
    return None


# ── Sections ──────────────────────────────────────────────────────────────
#: Words a full section should not fall below, or an introduction exceed — unless the writer asked otherwise.
SECTION_MIN_WORDS = 150
INTRO_MIN_WORDS = 35
INTRO_MAX_WORDS = 260


def _without_echo(text: str, fmt: str, title: str) -> str:
    """The text minus a first line that repeats the section's own heading."""
    lines = text.lstrip("\n").split("\n")
    found = _heading(lines[0], fmt) if lines else None
    if found and unnumber(found[1]).strip().lower() == title.strip().lower():
        return "\n".join(lines[1:]).lstrip("\n")
    return text


def check_section(
    shaped: str,
    *,
    raw: str,
    fmt: str,
    title: str,
    has_children: bool,
    truncated: bool,
    instruction: str = "",
) -> List[Issue]:
    """Everything wrong with a generated section, serious first."""
    issues: List[Issue] = []
    body = _without_echo(shaped, fmt, title)
    words = _words(_prose(body, fmt))
    asked = bool(instruction.strip())

    if truncated:
        issues.append(Issue(
            "truncated",
            "Your previous answer was cut off at the length limit before it finished. Write the section again, "
            "complete and a little more concisely, so it ends on a finished sentence.",
        ))
    for found in (refusal(raw), unbalanced(raw, fmt)):
        if found:
            issues.append(found)
    if words < 15:
        issues.append(Issue("empty", "Your answer had almost no text. Write the section in full."))
    elif not asked and has_children and words < INTRO_MIN_WORDS:
        issues.append(Issue(
            "short",
            f"The opening was only {words} words. Write 80-150 words of prose, with no headings: the sub-sections "
            "are written separately.",
        ))
    elif not asked and not has_children and words < SECTION_MIN_WORDS:
        issues.append(Issue("short", f"The section was only {words} words. Explain the topic properly: 350-700 words."))
    if not asked and has_children and words > INTRO_MAX_WORDS:
        issues.append(Issue(
            "intro-too-long",
            f"The opening ran to {words} words. It must be 80-150 words that orient the reader; its sub-sections are "
            "written separately, so do not explain their material here.",
        ))

    if not has_children:
        first = next((line for line in body.split("\n") if line.strip()), "")
        if _heading(first, fmt):
            issues.append(Issue(
                "opens-with-heading",
                "You opened with a sub-heading. Begin with at least one paragraph of prose that introduces the "
                "section before any sub-heading.",
            ))

    if not truncated:
        ending = unfinished_end(body, fmt)
        if ending:
            issues.append(ending)
    if fmt == "mdx":
        table = table_shape(body)
        if table:
            issues.append(table)

    framing = _FRAMING.search(body)
    if framing:
        issues.append(Issue(
            "framing",
            f"You wrote about the document instead of writing it (\u201c{framing.group(0)}\u201d). Write as the "
            "author: start with the subject itself, and never refer to \u201cthis section\u201d.",
        ))
    stock = stock_phrases(body)
    if len(stock) >= STOCK_LIMIT:
        issues.append(Issue(
            "stock-phrases",
            "The prose leaned on stock phrases (" + ", ".join(f"\u201c{p}\u201d" for p in stock) + "). Say each "
            "thing plainly and specifically instead.",
        ))
    elif stock:
        issues.append(Issue("stock-phrase", "Stock phrasing: " + ", ".join(stock), serious=False))
    return issues


# ── Inline edits ──────────────────────────────────────────────────────────
#: Edits whose answer is a list or a table, where "ends without a full stop" is normal.
_STRUCTURED = {"bullets", "table"}


def check_fragment(text: str, *, raw: str, fmt: str, truncated: bool, action: str, replaces: bool) -> List[Issue]:
    """What is wrong with an inline edit's answer, serious first."""
    issues: List[Issue] = []
    if truncated:
        issues.append(Issue(
            "truncated",
            "Your previous answer was cut off at the length limit. Answer again, complete, so it ends on a finished "
            "sentence.",
        ))
    found = refusal(raw)
    if found:
        issues.append(found)
    if not text.strip():
        issues.append(Issue("empty", "Your answer was empty. Return the text that was asked for."))
    if replaces and not truncated and action not in _STRUCTURED:
        ending = unfinished_end(text, fmt)
        if ending:
            issues.append(ending)
    if replaces and fmt == "mdx":
        table = table_shape(text)
        if table:
            issues.append(table)
    return issues


# ── Asking again ──────────────────────────────────────────────────────────
def serious(issues: Sequence[Issue]) -> List[Issue]:
    return [issue for issue in issues if issue.serious]


def revision_note(issues: Sequence[Issue]) -> str:
    """Appended to the original prompt when an answer is asked for again."""
    lines = "\n".join(f"- {issue.fix}" for issue in serious(issues))
    return (
        "\n\nIMPORTANT — your previous attempt could not be used, for these reasons:\n"
        f"{lines}\n"
        "Write the whole answer again from the beginning, following every rule above and fixing each of these."
    )


def better(first: Sequence[Issue], second: Sequence[Issue]) -> bool:
    """Whether the second attempt should replace the first: fewer serious problems, or as few."""
    return len(serious(second)) <= len(serious(first))


# ── Outline titles ────────────────────────────────────────────────────────
_TITLE_NOISE = re.compile(r"^(?:#+\s*|[-*+]\s+|(?:chapter|section|part)\s+\d+[:.]?\s*)", re.I)


def clean_title(title: str, *, numbering: bool = True) -> str:
    """An outline row's title as a heading should read: no markup, quotes or trailing colon.

    ``numbering`` also strips "3.1 " — right for a new outline, whose numbers
    the rail supplies, and wrong for one being refined: there the title must
    match an existing heading character for character, or its prose is lost.
    """
    text = re.sub(r"\s+", " ", str(title or "")).strip()
    if numbering:
        text = unnumber(_TITLE_NOISE.sub("", text))
    text = re.sub(r"^\*\*(.+)\*\*$|^\*(.+)\*$|^`(.+)`$", lambda m: next(g for g in m.groups() if g), text)
    text = text.strip().strip("\"'\u201c\u201d").rstrip(":.").strip()
    return text[:120]
