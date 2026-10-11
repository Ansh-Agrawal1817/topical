"""Document versions over the wire."""

from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, Field

from .common import ORMModel, UtcDatetime

#: Generous for prose, and well under the request body cap.
MAX_VERSION_CHARS = 2_000_000


class VersionInput(BaseModel):
    """Take a snapshot. The client sends the text it is showing — with live
    collaboration that is the document as everyone sees it, which the stored
    row may lag behind by an autosave."""

    content: str = Field(max_length=MAX_VERSION_CHARS)
    name: Optional[str] = Field(default=None, max_length=120)
    #: ``checkpoint`` is taken by the editor just before a large change (an
    #: outline applied, a version restored) — kept, and skipped if it would
    #: duplicate the newest snapshot.
    kind: Literal["auto", "manual", "restore", "checkpoint"] = "auto"


class VersionRename(BaseModel):
    #: Blank clears the name.
    name: str = Field(max_length=120)


class VersionOut(ORMModel):
    id: int
    name: Optional[str] = None
    kind: str
    words: int
    createdBy: str = Field(validation_alias="created_by")  # noqa: N815
    createdAt: Optional[UtcDatetime] = Field(default=None, validation_alias="created_at")  # noqa: N815
    createdByUsername: Optional[str] = None  # noqa: N815

    model_config = {"from_attributes": True, "populate_by_name": True}


class VersionDetail(VersionOut):
    content: str


class VersionList(BaseModel):
    versions: List[VersionOut]


class VersionCreated(BaseModel):
    #: Null when nothing was taken: an automatic snapshot of text that has not
    #: changed, or one inside the quiet interval after the last.
    version: Optional[VersionOut]
