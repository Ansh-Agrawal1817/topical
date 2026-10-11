"""The ``document_versions`` table — snapshots of a document's text.

A version is the whole text at one moment, not a diff: documents are small,
restoring one is a single read, and a chain of diffs is one corrupt link away
from every later version being unreadable.

Snapshots are taken automatically while someone writes (at most one every ten
minutes, and never twice of the same text), by hand, and just before a restore
— so restoring is itself undoable. Automatic ones are pruned to the newest
hundred; named ones are kept until someone deletes them.
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
    #: ``auto``, ``manual`` or ``restore`` (taken just before a restore).
    kind: Mapped[str] = mapped_column(String(16), nullable=False, default="auto")
    content: Mapped[str] = mapped_column(Text, nullable=False)
    words: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_by: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[Optional[datetime]] = created_at_column()

    __table_args__ = (Index("document_versions_plan_idx", "plan_id", "created_at"),)
