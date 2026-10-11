"""Prompt construction for every AI operation the editor exposes.

Kept apart from the route layer so wording can be tuned without touching HTTP
plumbing. Operations that exist in both output formats are written *once*: the
per-format differences live in `SECTION_FORMATS`, so a wording change cannot
land in MDX and be forgotten in LaTeX.
"""

from dataclasses import dataclass
from typing import Callable, Dict, List, Optional, Tuple

#: What Topical's own renderers can draw. Output outside this subset does not
#: fail loudly — it renders as a red "issue", a raw backslash command, or a
#: blank where an equation should be — so the prompt states the subset in
#: plain terms and `shape_section` repairs what still slips through.
RENDER_RULES = {
    "mdx": (
        "Markdown only, as rendered by GitHub-flavoured Markdown + KaTeX: headings (#), "
        "paragraphs, **bold**, *italic*, `code`, fenced code blocks with a language tag, "
        "- / 1. lists, > quotes, GFM tables (with a |---| separator row), [links](https://…). "
        "No HTML tags, no JSX or components, no import/export lines, no frontmatter, "
        "no Mermaid. Maths only as $...$ inline and $$...$$ on lines of their own — never "
        "\\( \\) or \\[ \\] — using only commands KaTeX supports (no \\label, \\ref, "
        "\\begin{align} outside $$, \\newcommand). Every $ and $$ must close."
    ),
    "latex": (
        "LaTeX body only, as rendered by Topical's subset renderer: \\section family, "
        "\\textbf/\\textit/\\emph/\\texttt, \\href, \\footnote, itemize/enumerate/description, "
        "quote, center, table + tabular (with \\hline), figure with \\caption, verbatim/lstlisting, "
        "theorem/lemma/definition/example/remark/proof, and maths in $...$, \\[...\\], equation, "
        "align, gather, cases, matrix/pmatrix/bmatrix. No preamble, \\usepackage, \\documentclass, "
        "\\begin{document}, \\maketitle, TikZ, algorithm/algorithmic, minipage, or custom "
        "packages. No \\includegraphics of files that do not exist, and no \\cite (there is no "
        "bibliography). Every \\begin has its \\end, every brace and $ closes, and "
        "special characters in prose are escaped (\\%, \\&, \\_, \\#, \\$)."
    ),
}

#: How cross-references work in Topical's LaTeX — resolved to real numbers in
#: both the live editor and the read view (preview/latex/labels.ts).
LATEX_REFERENCES = (
    "Cross-references: give every table, figure and numbered equation you write a label with "
    "a short unique slug — \\label{tab:…} right after \\caption inside the table, \\label{fig:…} "
    "after the figure's \\caption, \\label{eq:…} inside the equation/align — and put "
    "\\label{sec:…} on the line after the section heading. Refer to them in the prose as "
    "Table~\\ref{tab:…}, Figure~\\ref{fig:…}, \\eqref{eq:…} or Section~\\ref{sec:…} (always with ~ "
    "before \\ref). Only reference a label you define in this text or one listed as already in "
    "the document, and never define a listed label again."
)

FORMAT_RULES = {
    "mdx": "Write in Markdown for Topical. " + RENDER_RULES["mdx"],
    "latex": "Write in LaTeX body syntax for Topical. " + RENDER_RULES["latex"] + " " + LATEX_REFERENCES,
}


def format_rules(fmt: str) -> str:
    return FORMAT_RULES.get(fmt, FORMAT_RULES["mdx"])


# ---------------------------------------------------------------------------
# Long-form generation
# ---------------------------------------------------------------------------
def _hierarchy_context(topic: str, hierarchy: str, number: str = "") -> str:
    """The rest of the document, and where in it this section sits.

    The outline arrives numbered and annotated — each row carries its address
    ("2.3") and whether it is written yet. Both matter. "Do not repeat the
    other sections" is not an instruction a model can follow against a bare
    list of titles: it has no way to tell which of those sections already
    contain prose, so the safe reading is to cover everything, which is exactly
    what produced documents that said the same thing four times.
    """
    if not hierarchy:
        return ""
    address = f' (section {number})' if number else ""
    return (
        f"\nHere is the whole document outline. Rows are numbered by position, and "
        f"marked with whether they already contain prose:\n"
        f"<outline>\n{hierarchy}\n</outline>\n"
        f"You are writing '{topic}'{address} and nothing else. Every other row is written in "
        f"its own pass — the ones marked [written] already exist in the document, so repeating "
        f"their material puts it in twice, and the ones marked [not written yet] are someone "
        f"else's job, so covering them now writes them twice over."
    )


def _placement(ancestors: Optional[List[str]]) -> str:
    """The headings this section is nested under, spelled out.

    Without it every section is written as though it opened the document: a
    level-3 section re-introduces the field, re-defines the terms its parent
    just defined, and re-motivates the subject, because nothing in the prompt
    said a parent existed.
    """
    if not ancestors:
        return ""
    trail = " > ".join(ancestors)
    return (
        f"\nThis section is nested under: {trail}.\n"
        f"Those sections come before it in the document and have already introduced the "
        f"subject at their level. Continue from there — do not re-introduce the topic, "
        f"re-motivate it, or redefine terms they will have defined.\n"
    )


LATEX_LEVEL_COMMANDS = ["section", "subsection", "subsubsection", "paragraph", "subparagraph"]


def _latex_command(level: int) -> str:
    return LATEX_LEVEL_COMMANDS[max(1, min(level, len(LATEX_LEVEL_COMMANDS))) - 1]


def _mdx_heading(topic: str, level: int) -> str:
    return "#" * max(1, min(level, 6)) + " " + topic


def _latex_heading(topic: str, level: int) -> str:
    return "\\" + _latex_command(level) + "{" + topic + "}"


def _leave_to_children(children: Optional[List[str]]) -> str:
    """The instruction that stops a parent from writing its children's sections.

    Without it, asking for "Photosynthesis" returns a whole article covering
    light reactions and the Calvin cycle — and then those sections get written
    again in their own passes, so the document says everything twice. The list
    is spelled out rather than described, because "don't cover the subsections"
    is not something a model can check itself against.
    """
    if not children:
        return ""
    listed = "\n".join("- " + child for child in children)
    return (
        "\nThese sub-sections sit directly below this text and are written "
        "separately, each in its own pass:\n"
        f"<subsections>\n{listed}\n</subsections>\n"
    )


@dataclass(frozen=True)
class _SectionFormat:
    """Everything the section prompt has to say differently per output format.

    MDX and LaTeX ask for the same document — same length, same structure, same
    prohibition on covering a child's material — in two notations. Holding the
    differences in one table keeps the shared instructions literally shared, so
    a wording fix cannot land in one format and be forgotten in the other.
    """

    name: str
    #: The bullet that pins down the notation itself.
    syntax_rule: str
    #: How this format spells a heading at a given depth.
    heading: Callable[[str, int], str]
    #: How it names the sub-headings a full section should contain.
    deeper_rule: Callable[[int], str]
    #: The structural devices worth reaching for.
    devices: str
    #: Rules that exist only in this format.
    extra_rules: Tuple[str, ...]
    #: The closing "return only ..." instruction.
    closing: str
    #: What an introduction must not contain.
    intro_ban: str


SECTION_FORMATS: Dict[str, _SectionFormat] = {
    "mdx": _SectionFormat(
        name="MDX",
        syntax_rule=RENDER_RULES["mdx"],
        heading=_mdx_heading,
        deeper_rule=lambda level: f"3-5 sub-headings one level deeper ({'#' * min(level + 1, 6)})",
        devices="Use bullet points, numbered lists, code blocks where appropriate",
        extra_rules=(),
        closing="Return ONLY the MDX content",
        intro_ban="No sub-headings, no lists, no code blocks.",
    ),
    "latex": _SectionFormat(
        name="LaTeX",
        syntax_rule=RENDER_RULES["latex"] + " " + LATEX_REFERENCES,
        heading=_latex_heading,
        deeper_rule=lambda level: f"3-5 subsections one level deeper (\\{_latex_command(level + 1)}{{}})",
        devices="Use itemize/enumerate, equations, tables where appropriate",
        extra_rules=(),
        closing="Return ONLY the LaTeX content (no preamble, no \\begin{document})",
        intro_ban="No further sectioning commands, no lists.",
    ),
}


def section_format(fmt: str) -> _SectionFormat:
    return SECTION_FORMATS.get(fmt, SECTION_FORMATS["mdx"])


def _voice(sample: str) -> str:
    """Prose already in the document, for a new section to sound like.

    Without it every section is written in the model's own default register,
    so a document drafted by hand and then extended by the AI changes voice
    at every generated heading — and notation with it: one section writes
    $v$, the next writes "velocity v".
    """
    sample = sample.strip()
    if not sample:
        return ""
    return (
        "\nHere is some of the document as already written. Match its voice, register, "
        "sentence length, terminology and the way it writes notation — the new section "
        "should read as the same author's:\n"
        f"<sample>\n{sample[:900]}\n</sample>\n"
    )


def _labels_block(labels: Optional[List[str]]) -> str:
    """Labels already in the document, so new prose can point at them — and not reuse them."""
    if not labels:
        return ""
    listed = "\n".join("- " + label for label in labels[:40])
    return (
        "\nLabels already defined in the document (you may reference these with \\ref/\\eqref; "
        f"do not define them again):\n<labels>\n{listed}\n</labels>\n"
    )


def _lead_in(text: str) -> str:
    """The end of the text just before this section, so it continues rather than restarts."""
    text = text.strip()
    if not text:
        return ""
    return (
        "\nThe document just before this section ends like this — pick up from it; do not "
        f"repeat it or re-introduce what it already said:\n<before>\n…{text[-700:]}\n</before>\n"
    )


def _atomic_rule(spec: "_SectionFormat", level: int, has_children: bool) -> str:
    """The structural promise every section keeps, spelled in the document's own markup."""
    own = spec.heading("…", level).replace("…", "").strip()
    deeper = spec.heading("…", min(level + 1, 6)).replace("…", "").strip()
    if has_children:
        return (f"Write prose only below the heading: no headings of any level. "
                f"The sub-sections already exist and are written separately.")
    return (f"This section is one unit of the document. Any heading you add must be deeper "
            f"than {own} (use {deeper} or deeper) — never {own} or anything above it, which "
            f"would split this section or close its parent.")


def _rules_block(rules: List[str]) -> str:
    return "Requirements:\n" + "\n".join("- " + rule for rule in rules)


def section_prompt(
    fmt: str,
    topic: str,
    main_topic: str,
    context: str = "",
    hierarchy: str = "",
    children: Optional[List[str]] = None,
    ancestors: Optional[List[str]] = None,
    section_number: str = "",
    level: int = 1,
    instruction: str = "",
    style_sample: str = "",
    lead_in: str = "",
    labels: Optional[List[str]] = None,
) -> str:
    """Ask for one section of a document, in whichever notation it is written.

    A section with children gets an *introduction* — its sub-sections are
    written in their own passes, and a parent that explains them puts the same
    prose in the document twice.

    ``instruction`` is what the writer asked for beyond the title — a length, a
    stance, an audience. It is placed last in the rules and marked as
    overriding them, because a standing rule the writer has just contradicted
    ("400-800 words" against "keep this brief") is the one they meant to break.
    """
    spec = section_format(fmt)
    ctx = (
        "\nReference material from the writer's sources — use what is relevant, state facts "
        "only as far as it supports them, and do not copy it verbatim:\n"
        f"<sources>\n{context}\n</sources>\n"
    ) if context else ""
    ctx += _lead_in(lead_in)
    ctx += _labels_block(labels) if fmt == "latex" else ""
    ctx += _voice(style_sample)
    atomic = _atomic_rule(spec, level, bool(children))
    heading = spec.heading(topic, level)
    #: Stated as an override rather than merged into the list: a request that
    #: conflicts with a default is the writer correcting the default.
    ask = (
        f"The writer asked for this specifically — follow it, and where it "
        f"conflicts with a rule above, it wins: {instruction.strip()}"
        if instruction.strip() else ""
    )

    if children:
        return (
            "You are an expert technical writer working through a document one section at a time.\n\n"
            f'Write the OPENING of the section "{topic}" — its introduction, not the section itself.\n'
            f'Part of a document about: "{main_topic}"\n'
            f"{_hierarchy_context(topic, hierarchy, section_number)}\n"
            f"{_placement(ancestors)}"
            f"{_leave_to_children(children)}"
            f"{ctx}\n"
            + _rules_block([
                spec.syntax_rule,
                f"Start with {heading}",
                atomic,
                f"Then 80-150 words of plain prose. {spec.intro_ban}",
                "Orient the reader: what this section covers, why it matters, and how the "
                "sub-sections above relate to each other.",
                "Define any term the sub-sections will assume the reader already knows.",
                "Do NOT explain, summarise, or preview the sub-sections listed above, or anything "
                "nested beneath them. They are written separately, and covering them here puts the "
                "same material in the document twice.",
                *spec.extra_rules,
                *([ask] if ask else []),
                spec.closing,
            ])
        )

    return (
        f"You are an expert technical writer creating educational {spec.name} content.\n\n"
        f'Generate comprehensive {spec.name} content for the section: "{topic}"\n'
        f'Part of a document about: "{main_topic}"\n'
        f"{_hierarchy_context(topic, hierarchy, section_number)}\n"
        f"{_placement(ancestors)}"
        f"{ctx}\n"
        + _rules_block([
            spec.syntax_rule,
            f"Start with {heading}",
            atomic,
            spec.deeper_rule(level),
            f'STRICTLY relevant to "{topic}". Do not overlap with or redundantly cover other '
            "sections in the outline — each of them is written separately.",
            spec.devices,
            *spec.extra_rules,
            "Educational, clear, well-structured",
            "400-800 words",
            *([ask] if ask else []),
            spec.closing,
        ])
    )


#: The nesting rule shared by both hierarchy prompts.
#:
#: A subtopic may be a name or another node, so the tree can go deeper where
#: the subject actually does. The wire shape used to be a flat list of strings,
#: which capped every generated outline at two levels however the model was
#: asked — the rail draws six, and a third level had nowhere to land.
_NESTED_JSON_SHAPE = (
    'A JSON object with a "topics" list. A subtopic is either a name, or an object with its own subtopics:\n'
    '{"topics": [{"topic": "Main topic", "subtopics": ["Sub 1", '
    '{"topic": "Sub 2", "subtopics": ["Sub 2a", "Sub 2b"]}]}]}\n'
    'Keep it compact: names only, no descriptions, no commentary before or after the JSON.\n'
)


def topic_hierarchy_prompt(query: str) -> str:
    """An outline for a document about ``query``.

    The old wording asked for "a hierarchy for learning about" the subject and
    got a syllabus back: "Introduction to X", "Overview", "Conclusion" — rows
    that say nothing about what the section will hold, and that every subject
    shares. The rules below are the ones an editor applies to a contents page.
    """
    return (
        f'Plan the outline of a substantial written document about "{query}".\n\n'
        f"Return ONLY valid JSON in this format:\n"
        f"{_NESTED_JSON_SHAPE}\n"
        "Rules:\n"
        "- 4-6 main sections, 2-4 subsections each, in an order that builds: each section can rely "
        "on the ones before it.\n"
        "- Name what each section is about, specifically. No generic rows such as \"Introduction\", "
        "\"Overview\", \"Background\", \"Conclusion\" or \"Summary\" unless the subject itself calls for one.\n"
        "- Siblings are phrased in parallel and do not overlap; no subsection repeats its parent's name.\n"
        "- Keep names under about six words, so they fit a sidebar.\n"
        "- Nest a third level only where a subsection genuinely splits into parts worth writing "
        "separately — never to pad the outline out. Depth 3 at most."
    )


def _headings_of(document: str) -> str:
    """Every heading line in a document, in order — its existing shape, whatever its length."""
    lines = []
    for line in document.splitlines():
        stripped = line.strip()
        if stripped.startswith("#") or stripped.startswith("\\section") or stripped.startswith("\\subsection") \
                or stripped.startswith("\\subsubsection") or stripped.startswith("\\chapter"):
            lines.append(stripped)
    return "\n".join(lines[:200])


def outline_from_document_prompt(document: str, fmt: str) -> str:
    """Reverse-engineer a working outline from a draft the user already has.

    A long draft is cut to its first 12,000 characters, so its headings are
    sent separately and in full: the model sees the whole of the existing
    structure even when it only reads the start of the prose.
    """
    headings = _headings_of(document)
    shape = f"\nIts headings so far, in order:\n<headings>\n{headings}\n</headings>\n" if headings else ""
    return (
        "Read this draft and propose the outline it is reaching for — keeping the sections that work, "
        "in their order, and adding the ones it is missing.\n\n"
        f"<document>\n{document[:12000]}\n</document>\n"
        f"{shape}\n"
        "Return ONLY valid JSON in this format:\n"
        f"{_NESTED_JSON_SHAPE}\n"
        "Rules: 3-6 main sections, 2-4 subtopics each; follow the draft's own vocabulary; keep names "
        "short enough to fit a sidebar; no generic \"Introduction\"/\"Conclusion\" rows the draft does not "
        "already have; and nest a third level only where the draft itself already goes that deep."
    )


def refine_outline_prompt(outline: str, subject: str = "", instruction: str = "") -> str:
    """Reorganise an outline the writer has been editing, and say why.

    The reasoning is the point. A restructure that arrives as a finished list
    is one the writer has to reverse-engineer before they can trust it, so the
    model is asked to account for every row it touched — and to stay silent
    about the ones it left alone, or the explanation drowns in "kept as is".
    """
    about = f'The document is about "{subject}".\n' if subject else ""
    extra = f"\nThe author also asks: {instruction.strip()}\n" if instruction.strip() else ""
    return (
        "You are an editor restructuring the outline of a document.\n"
        f"{about}"
        "Here is the current outline, indented by depth. A word count means that "
        "section is already written; sections with no count are empty headings:\n"
        f"<outline>\n{outline}\n</outline>\n"
        f"{extra}"
        "\nMoving or renaming a written section is not free — its prose travels with "
        "it, and a rename that no longer describes what is underneath leaves the "
        "document wrong. Restructure empty headings freely; touch written ones only "
        "where the structure is genuinely at fault, and say so in the reason.\n"
        "\nImprove the structure: fix the ordering so it builds logically, regroup "
        "topics that belong together, adjust depth where a heading is really a "
        "sub-point of its neighbour, split anything that covers two ideas, and add "
        "a section only where there is a real gap. Keep the author's wording unless "
        "it is genuinely unclear. Do not pad it out — a good outline can come back "
        "the same length or shorter.\n\n"
        "Return ONLY valid JSON, no code fence, in exactly this shape:\n"
        '{"summary": "one sentence on what you changed overall", '
        '"outline": [{"title": "Section name", "level": 1}], '
        '"changes": [{"title": "Section name", "kind": "renamed", "from": "Old section name", "reason": "why"}]}\n\n'
        "Rules:\n"
        "- `level` starts at 1 and never jumps by more than one between consecutive rows.\n"
        "- `kind` is one of: moved, renamed, added, removed, nested, split.\n"
        "- List a change for every row you altered, and for nothing you left alone.\n"
        "- Each `reason` is one short sentence naming the actual problem it fixes.\n"
        "- `title` in `changes` must match the row's new title (or the old one, if removed).\n"
        "- `from` is the exact current title the row came from. Give it for every renamed "
        "or split row (for a split, the row it was split out of); leave it out otherwise. "
        "A written section's prose follows `from` to its new title."
    )


# ---------------------------------------------------------------------------
# Selection transforms — the editor's inline AI actions
# ---------------------------------------------------------------------------
# Each entry is (instruction, returns_replacement). Actions that return a
# replacement have their output swapped into the document; the rest are shown
# as an answer the writer reads and dismisses. `{words}` is the passage's
# length, filled in when the prompt is built, so "shorter" and "longer" are
# targets rather than moods.
TRANSFORM_ACTIONS = {
    "improve":  ("Rewrite the passage so it reads more clearly and precisely. Keep the author's voice, claims, structure "
                 "(paragraphs, lists) and level of detail; fix vague wording, clumsy rhythm and buried points. Do not add facts.", True),
    "expand":   ("Expand the passage with concrete detail, examples and reasoning, to about {double} words. Every added "
                 "sentence must earn its place — no padding, no restating.", True),
    "shorten":  ("Tighten the passage to about {half} words. Keep every substantive point and every citation; cut hedging, "
                 "repetition and throat-clearing.", True),
    "grammar":  ("Fix spelling, grammar and punctuation. Change nothing else — not word choice, not structure, not markup.", True),
    "simplify": ("Rewrite the passage in plain language a first-year student could follow. Keep it accurate; define any "
                 "jargon the first time it appears.", True),
    "academic": ("Rewrite the passage in a formal academic register: precise, impersonal, hedged where the evidence is, "
                 "no contractions.", True),
    "bullets":  ("Restructure the passage as a tight bulleted list, one idea per bullet, preserving all information.", True),
    "table":    ("Restructure the information in the passage as a table with clear column headers. Keep every value.", True),
    "math":     ("Rewrite the passage with the mathematics set properly: real notation, display equations where they aid "
                 "reading, and every symbol defined where it first appears.", True),
    "continue": ("Continue writing from where the passage stops, about {continue_words} words. Match its voice, format, "
                 "depth and notation, and move the argument forward rather than summarising it. Return ONLY the new "
                 "continuation — do not repeat any of the existing text.", True),
    "explain":  ("Explain the passage: what it says, why it matters here, and anything it gets wrong or leaves out. Point "
                 "out any claim that needs a source. Be specific and brief.", False),
    "custom":   ("", True),
}

#: What an edit must leave alone, per notation. Rewrites used to come back
#: with links flattened to their text, citations dropped and $x$ turned into
#: "x" — the passage read better and the document broke.
PRESERVE_RULES = {
    "mdx": (
        "Keep every link, image, footnote marker, inline code span, $maths$ and $$display maths$$ exactly as "
        "written unless the task is to change them. Keep the passage's own Markdown structure."
    ),
    "latex": (
        "Keep every command, \\cite, \\ref, \\eqref, \\label, footnote and maths environment intact unless the "
        "task is to change them. Write LaTeX body syntax only."
    ),
}


def _words(text: str) -> int:
    return len([w for w in text.split() if any(c.isalnum() for c in w)])


def transform_prompt(
    action: str,
    fmt: str,
    selection: str,
    instruction: str = "",
    before: str = "",
    after: str = "",
    title: str = "",
    section: str = "",
    outline: str = "",
    previous: str = "",
    labels: Optional[List[str]] = None,
) -> str:
    """Prompt for an inline edit of one passage, with its neighbours as context."""
    directive, replaces = TRANSFORM_ACTIONS.get(action, TRANSFORM_ACTIONS["custom"])
    n = max(_words(selection), 1)
    directive = directive.format(double=n * 2, half=max(n // 2, 8), continue_words=max(80, min(n, 220)))
    if action == "custom" or not directive:
        directive = instruction.strip() or "Improve this passage."
    elif instruction.strip():
        directive = f"{directive}\nAdditional instruction from the author: {instruction.strip()}"

    doc_line = f'The document is titled "{title}".\n' if title else ""
    where = f"The passage is in the section: {section}.\n" if section.strip() else ""
    shape = (
        "The document's outline, for context — keep terms and scope consistent with it, and do not "
        f"stray into what other sections cover:\n<outline>\n{outline[:1500]}\n</outline>\n"
        if outline.strip() else ""
    )
    surroundings = ""
    if before.strip():
        surroundings += f"\nText immediately before the passage (do not rewrite it):\n<before>\n{before[-2400:]}\n</before>\n"
    if after.strip():
        surroundings += f"\nText immediately after the passage (do not rewrite it):\n<after>\n{after[:1600]}\n</after>\n"
    again = (
        "\nThe author has already seen this attempt and asked for another. Write a genuinely different "
        "version — different phrasing and structure — that still does the task:\n"
        f"<previous>\n{previous[:3000]}\n</previous>\n"
        if previous.strip() else ""
    )

    if replaces:
        tail = (
            f"{format_rules(fmt)}\n{PRESERVE_RULES.get(fmt, PRESERVE_RULES['mdx'])}\n"
            "Return ONLY the replacement text. No preamble, no explanation, no code fence "
            "around the whole answer, no restating of the surrounding context."
        )
    else:
        tail = (
            "Answer in at most 150 words of plain prose. Do not return a rewritten "
            "version of the passage."
        )

    return (
        f"You are a meticulous writing collaborator working inside a document editor.\n"
        f"{doc_line}{where}{shape}"
        f"{_labels_block(labels) if fmt == 'latex' else ''}"
        f"{surroundings}\n"
        f"Passage to work on:\n<passage>\n{selection}\n</passage>\n"
        f"{again}\n"
        f"Task: {directive}\n\n"
        f"{tail}"
    )


def trim_echo(before: str, text: str) -> str:
    """Drop whatever a continuation repeats of the text it continues.

    Asked to continue, models often restate the last sentence before going on,
    so the document gets it twice. The longest tail of ``before`` (up to 400
    characters) that the answer opens with is cut.
    """
    tail = before[-400:].strip()
    out = text.lstrip()
    for size in range(len(tail), 11, -1):
        if out.startswith(tail[-size:]):
            return out[size:].lstrip()
    return text


def strip_wrappers(text: str) -> str:
    """Drop a <passage> wrapper the model echoed back around its answer."""
    stripped = text.strip()
    for tag in ("passage", "replacement", "answer"):
        if stripped.startswith(f"<{tag}>") and stripped.endswith(f"</{tag}>"):
            return stripped[len(tag) + 2: -(len(tag) + 3)].strip()
    return stripped


def strip_fences(text: str, fmt: Optional[str] = None) -> str:
    """Drop a whole-answer code fence, which models add despite instructions."""
    stripped = text.strip()
    if not stripped.startswith("```"):
        return stripped
    lines = stripped.splitlines()
    if len(lines) < 2:
        return stripped
    # Only unwrap when the fence encloses the entire answer.
    if lines[-1].strip() != "```":
        return stripped
    return "\n".join(lines[1:-1]).strip()


# ---------------------------------------------------------------------------
# Review — an AI collaborator reading the section someone just worked on
# ---------------------------------------------------------------------------
def review_prompt(
    fmt: str, title: str, section: str, text: str, outline: str = "", instructions: str = "", seen: list[str] | None = None,
) -> str:
    """Ask for the few changes a section actually needs, and nothing else.

    The collaborator runs every few seconds on whatever was last touched, so
    an over-eager reviewer is noise in the margin of every paragraph. The
    prompt is built to make silence the normal answer: only real problems,
    each quoted exactly so it can be found and replaced, and an empty list
    when the section is fine — which it usually should be.
    """
    markup = "LaTeX" if fmt == "latex" else "Markdown/MDX"
    about = f'The document is "{title}".\n' if title else ""
    shape = f"Its outline:\n<outline>\n{outline}\n</outline>\n" if outline.strip() else ""
    asked = f"\nThe author asked you, as their reviewer, to focus on: {instructions.strip()}\n" if instructions.strip() else ""
    skip = ""
    if seen:
        listed = "\n".join(f"- {q[:200]}" for q in seen[:40])
        skip = f"\nThese passages were already raised or dismissed. Do not suggest changes to them again:\n{listed}\n"
    return (
        "You are a careful co-author reviewing one section of a shared document while others write it.\n"
        f"{about}{shape}"
        f"The section is: {section}\n"
        f"It is written in {markup}. Here is its text:\n<section>\n{text}\n</section>\n"
        f"{asked}{skip}"
        "\nSuggest a change ONLY where something is actually wrong or clearly worse than it should be: a factual or "
        "mathematical error, a contradiction with the rest of the outline, a sentence whose meaning is unclear or "
        "broken, a spelling or grammar mistake, or broken markup. Do not rewrite for taste, do not restyle sentences "
        "that work, do not add content, and do not comment on text that is plainly unfinished mid-sentence — someone "
        "may still be typing it. If the section is fine, return no suggestions; that is the expected answer most of "
        "the time. Never more than 3.\n\n"
        "Return ONLY valid JSON, no code fence, in exactly this shape:\n"
        '{"suggestions": [{"quote": "exact text from the section", "replacement": "what it should say instead", '
        '"kind": "error", "reason": "one short sentence"}]}\n\n'
        "Rules:\n"
        "- `quote` is copied character for character from the section, markup included, and is as short as possible "
        "while still unique — a phrase or a sentence, never a whole paragraph.\n"
        "- `replacement` replaces exactly the quote, in the same markup.\n"
        "- `kind` is one of: error, clarity, grammar, consistency, markup.\n"
        '- Nothing to change: {"suggestions": []}.'
    )
