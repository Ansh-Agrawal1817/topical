"""The ``document_versions`` table — snapshots of a document's text.

A version is the whole text at one moment, not a diff: documents are small,
restoring one is a single read, and a chain of diffs is one corrupt link away
from every later version being unreadable.

Snapshots are taken automatically while someone writes (at most one every ten
minutes, and never twice of the same text), by hand, and just before a restore
— so restoring is itself undoable. Automatic ones are pruned to the newest
hundred; named ones are kept until someone deletes them.

History is a graph, not a list. Each version records the version it was taken
on top of (``parent_id``) and its branch; a document is on one branch at a
time, and a fork is a new branch started from any version. A restore or a
merge draws a second edge (``restored_from_id``, ``merged_from_id``).
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from ..base import Base, created_at_column


class DocumentVersion(Base):
    __tablename__ = "document_versions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    plan_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("lesson_plans.id", ondelete="CASCADE"), nullable=False
    )
    #: Null until someone names it; the client shows the time instead.
    name: Mapped[Optional[str]] = mapped_column(String(120))
    #: ``auto``, ``manual``, ``checkpoint`` (before a large change), ``restore``
    #: (an older version brought back), ``merge`` or ``switch`` (the page as it
    #: was left when the document moved to another branch).
    kind: Mapped[str] = mapped_column(String(16), nullable=False, default="auto")
    content: Mapped[str] = mapped_column(Text, nullable=False)
    words: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_by: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[Optional[datetime]] = created_at_column()
    branch_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("document_branches.id", ondelete="CASCADE")
    )
    #: The version this one was taken on top of; null for a branch's root.
    parent_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("document_versions.id", ondelete="SET NULL")
    )
    merged_from_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("document_versions.id", ondelete="SET NULL")
    )
    restored_from_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("document_versions.id", ondelete="SET NULL")
    )
    #: ``human`` or ``ai`` — who wrote the change this version records.
    source: Mapped[str] = mapped_column(String(16), nullable=False, default="human")

    __table_args__ = (
        Index("document_versions_plan_idx", "plan_id", "created_at"),
        Index("document_versions_branch_idx", "branch_id", "created_at"),
    )


class DocumentBranch(Base):
    """A line of a document's history. "main" is made on the first snapshot.

    ``head_version_id`` is the branch's newest version — or, for a fork with
    nothing of its own yet, the version it was forked from.
    """

    __tablename__ = "document_branches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    plan_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("lesson_plans.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    head_version_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("document_versions.id", ondelete="SET NULL", use_alter=True)
    )
    created_by: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[Optional[datetime]] = created_at_column()

    __table_args__ = (Index("document_branches_plan_idx", "plan_id"),)
