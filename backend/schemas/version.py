"""Document versions and branches over the wire."""

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
    #: outline applied, a batch of sections written) — kept, and skipped if it
    #: would duplicate the branch's newest snapshot. ``merge`` records the page
    #: after another branch's sections were brought in (``mergedFromId``).
    kind: Literal["auto", "manual", "checkpoint", "merge"] = "auto"
    #: Who wrote the change this snapshot records.
    source: Literal["human", "ai"] = "human"
    #: The branch the client believes the document is on. An automatic
    #: snapshot from a tab that has not heard about a switch is dropped rather
    #: than filed on the wrong branch.
    branchId: Optional[int] = None  # noqa: N815
    mergedFromId: Optional[int] = None  # noqa: N815


class VersionRename(BaseModel):
    #: Blank clears the name.
    name: str = Field(max_length=120)


class WorkingCopy(BaseModel):
    """The page as the client shows it, kept as a version before the page changes."""

    content: str = Field(max_length=MAX_VERSION_CHARS)


class ForkInput(WorkingCopy):
    fromVersionId: int  # noqa: N815
    name: str = Field(min_length=1, max_length=80)
    #: Move the document onto the new branch at once.
    switch: bool = True


class BranchRename(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class VersionOut(ORMModel):
    id: int
    name: Optional[str] = None
    kind: str
    words: int
    createdBy: str = Field(validation_alias="created_by")  # noqa: N815
    createdAt: Optional[UtcDatetime] = Field(default=None, validation_alias="created_at")  # noqa: N815
    createdByUsername: Optional[str] = None  # noqa: N815
    branchId: Optional[int] = Field(default=None, validation_alias="branch_id")  # noqa: N815
    parentId: Optional[int] = Field(default=None, validation_alias="parent_id")  # noqa: N815
    mergedFromId: Optional[int] = Field(default=None, validation_alias="merged_from_id")  # noqa: N815
    restoredFromId: Optional[int] = Field(default=None, validation_alias="restored_from_id")  # noqa: N815
    source: str = "human"

    model_config = {"from_attributes": True, "populate_by_name": True}


class VersionDetail(VersionOut):
    content: str


class BranchOut(ORMModel):
    id: int
    name: str
    headVersionId: Optional[int] = Field(default=None, validation_alias="head_version_id")  # noqa: N815
    createdBy: str = Field(validation_alias="created_by")  # noqa: N815
    createdAt: Optional[UtcDatetime] = Field(default=None, validation_alias="created_at")  # noqa: N815

    model_config = {"from_attributes": True, "populate_by_name": True}


class VersionList(BaseModel):
    versions: List[VersionOut]
    branches: List[BranchOut] = Field(default_factory=list)
    currentBranchId: Optional[int] = None  # noqa: N815


class VersionCreated(BaseModel):
    #: Null when nothing was taken: an automatic snapshot of text that has not
    #: changed, or one inside the quiet interval after the last.
    version: Optional[VersionOut]
    #: The branch the document is on now — so a tab that missed a switch learns of it.
    currentBranchId: Optional[int] = None  # noqa: N815


class PageChange(BaseModel):
    """A history operation that changes the page: what to show now, and where the document is."""

    content: str
    currentBranchId: int  # noqa: N815
    version: Optional[VersionOut] = None
    branch: Optional[BranchOut] = None
