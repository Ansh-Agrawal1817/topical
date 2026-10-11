"""Request bodies for the AI routes.

These live with the other schemas rather than beside the prompt code, because
they describe the HTTP surface: the service layer underneath takes plain
arguments and knows nothing about FastAPI.
"""

from typing import List, Optional

from pydantic import BaseModel, Field


class SearchTopicsRequest(BaseModel):
    query: str


class GenerateSectionRequest(BaseModel):
    """One section of a document, written in its own pass.

    ``source`` chooses what the model is grounded in: its own knowledge, or the
    pages on the writer's context shelf (``urls``). "web" (Wikipedia for the
    topic) is still accepted for older clients. That is the only thing
    that varied across the six endpoints this replaced; the prompt, the
    context, and the response were otherwise identical.

    ``children`` are the sub-sections written separately in their own passes. A
    parent that explains them produces the same prose twice, so it gets an
    introduction instead of an article.
    """

    topic: str
    main_topic: str
    format: str = "mdx"
    source: str = "llm"
    urls: List[str] = Field(default_factory=list)
    #: The whole outline as a numbered tree, marked with what is already
    #: written. A bare list of titles gave the model no way to tell which of
    #: its neighbours exist, so "do not repeat them" was unfollowable.
    hierarchy: Optional[str] = None
    children: Optional[List[str]] = None
    #: Headings this section is nested inside, outermost first.
    ancestors: Optional[List[str]] = None
    #: Its number in the outline — "2.3" — so the model knows where it sits.
    section_number: Optional[str] = None
    level: int = 1
    #: A stretch of prose already in the document, so a new section reads as
    #: the same writer's: voice, register, how maths and terms are written.
    style_sample: Optional[str] = None
    #: What the writer asked for on top of the section's title — "keep it under
    #: 300 words", "lead with a worked example". Distinct from ``topic``, which
    #: says what the section is *about*: this says how it should be written.
    instruction: Optional[str] = None
    #: The last lines of the document just before this section, so it picks
    #: up where the reader is rather than restarting the subject.
    lead_in: Optional[str] = None
    #: LaTeX labels already in the document — "tab:errors → Table 2 (Error
    #: rates)" — so the section can reference them and never redefine them.
    labels: Optional[List[str]] = None


class SourcesRequest(BaseModel):
    """Find pages worth reading for a subject — the context shelf's "top 5"."""

    query: str
    limit: int = 5


class TransformRequest(BaseModel):
    """An inline edit of one passage, with its neighbours for context."""

    action: str
    selection: str
    format: str = "mdx"
    instruction: Optional[str] = None
    before: Optional[str] = None
    after: Optional[str] = None
    title: Optional[str] = None
    #: The headings the passage sits under, outermost first — "Results >
    #: Error analysis". A rewrite that knows which section it is in keeps to
    #: that section's job instead of drifting into its neighbours'.
    section: Optional[str] = None
    #: The document's headings, indented by depth: the whole shape the
    #: passage belongs to, so terms and scope stay consistent with it.
    outline: Optional[str] = None
    #: What the last attempt returned, when the writer asks for another. A
    #: retry sent the same prompt and, as often as not, got the same answer.
    previous: Optional[str] = None
    #: The heading level (as written in the markup) of the section the passage
    #: sits in. No heading the edit adds may be at or above it.
    level: Optional[int] = None
    #: LaTeX labels already in the document, as for a section.
    labels: Optional[List[str]] = None


class OutlineFromDocumentRequest(BaseModel):
    document: str
    format: str = "mdx"


class OutlineNodeIn(BaseModel):
    """One row of an outline the writer has been editing by hand."""

    title: str
    level: int = 1
    #: Words already written under it. Moving a section carrying 900 words is
    #: not the same proposition as moving an empty heading, and a model shown
    #: only titles cannot weigh the difference.
    words: int = 0


class RefineOutlineRequest(BaseModel):
    """Ask for a better-organised version of an outline, and why it changed."""

    outline: List[OutlineNodeIn]
    subject: Optional[str] = None
    instruction: Optional[str] = None
    format: str = "mdx"
