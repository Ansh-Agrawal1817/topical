"""Snapshots of a document's text: taking, listing, naming, restoring.

Who may see a document's history is who may write it — the same
``writable_by`` rule. History holds text that was later deleted, sometimes on
purpose, so a reader of a published document does not get it.
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import delete, exists, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.errors import NotFound
from ..db.models import DocumentVersion, LessonPlan, User
from ..schemas.version import VersionDetail, VersionInput, VersionOut
from .lesson_plans import writable_by

#: One automatic snapshot per this much time, whoever is writing.
AUTO_INTERVAL = timedelta(minutes=10)
#: Automatic snapshots kept per document; named and manual ones are not pruned.
AUTO_KEEP = 100
#: How many the history lists.
LIST_LIMIT = 200

_WORD = re.compile(r"[\w'’-]+")


def _words(text: str) -> int:
    return len(_WORD.findall(text))


async def _require_access(db: AsyncSession, plan_id: int, user_id: str) -> None:
    allowed = await db.scalar(
        select(exists().where(LessonPlan.id == plan_id, writable_by(user_id)))
    )
    if not allowed:
        raise NotFound("Lesson plan not found")


def _out(version: DocumentVersion, username: Optional[str], detail: bool = False) -> VersionOut:
    model = (VersionDetail if detail else VersionOut).model_validate(version)
    model.createdByUsername = username
    return model


async def list_versions(db: AsyncSession, plan_id: int, user_id: str) -> list[VersionOut]:
    """Newest first, without the text — the list is for choosing one."""
    await _require_access(db, plan_id, user_id)
    rows = (
        await db.execute(
            select(
                DocumentVersion.id, DocumentVersion.name, DocumentVersion.kind,
                DocumentVersion.words, DocumentVersion.created_by, DocumentVersion.created_at,
                User.username,
            )
            .outerjoin(User, DocumentVersion.created_by == User.id)
            .where(DocumentVersion.plan_id == plan_id)
            .order_by(DocumentVersion.created_at.desc(), DocumentVersion.id.desc())
            .limit(LIST_LIMIT)
        )
    ).all()
    return [
        VersionOut(
            id=row.id, name=row.name, kind=row.kind, words=row.words,
            createdBy=row.created_by, createdAt=row.created_at, createdByUsername=row.username,
        )
        for row in rows
    ]


async def get_version(db: AsyncSession, plan_id: int, version_id: int, user_id: str) -> VersionOut:
    await _require_access(db, plan_id, user_id)
    row = (
        await db.execute(
            select(DocumentVersion, User.username)
            .outerjoin(User, DocumentVersion.created_by == User.id)
            .where(DocumentVersion.id == version_id, DocumentVersion.plan_id == plan_id)
        )
    ).first()
    if row is None:
        raise NotFound("Version not found")
    return _out(row[0], row[1], detail=True)


async def take(db: AsyncSession, plan_id: int, payload: VersionInput, user_id: str) -> Optional[VersionOut]:
    """Store a snapshot, or decline an automatic one that would add nothing.

    An automatic snapshot is skipped when the newest snapshot already holds
    this exact text, or when another automatic one was taken within the
    interval — two collaborators' browsers both asking every ten minutes
    should still leave one row per ten minutes, not two.
    """
    await _require_access(db, plan_id, user_id)
    if payload.kind in ("auto", "checkpoint", "restore"):
        latest = (
            await db.execute(
                select(DocumentVersion.content, DocumentVersion.kind, DocumentVersion.created_at)
                .where(DocumentVersion.plan_id == plan_id)
                .order_by(DocumentVersion.created_at.desc(), DocumentVersion.id.desc())
                .limit(1)
            )
        ).first()
        if latest is not None:
            recent = latest.created_at and datetime.utcnow() - latest.created_at < AUTO_INTERVAL
            if latest.content == payload.content:
                return None
            if payload.kind == "auto" and recent and latest.kind == "auto":
                return None
        if not payload.content.strip():
            return None

    name = (payload.name or "").strip() or None
    version = DocumentVersion(
        plan_id=plan_id, name=name, kind=payload.kind, content=payload.content,
        words=_words(payload.content), created_by=user_id, created_at=datetime.utcnow(),
    )
    db.add(version)
    await db.flush()

    if payload.kind == "auto":
        # Keep the newest AUTO_KEEP unnamed automatic snapshots.
        keep = (
            select(DocumentVersion.id)
            .where(DocumentVersion.plan_id == plan_id, DocumentVersion.kind == "auto", DocumentVersion.name.is_(None))
            .order_by(DocumentVersion.created_at.desc(), DocumentVersion.id.desc())
            .limit(AUTO_KEEP)
        )
        await db.execute(
            delete(DocumentVersion).where(
                DocumentVersion.plan_id == plan_id,
                DocumentVersion.kind == "auto",
                DocumentVersion.name.is_(None),
                DocumentVersion.id.not_in(keep.scalar_subquery()),
            )
        )
    username = await db.scalar(select(User.username).where(User.id == user_id))
    return _out(version, username)


async def rename(db: AsyncSession, plan_id: int, version_id: int, name: str, user_id: str) -> VersionOut:
    await _require_access(db, plan_id, user_id)
    version = (
        await db.execute(
            update(DocumentVersion)
            .where(DocumentVersion.id == version_id, DocumentVersion.plan_id == plan_id)
            .values(name=name.strip() or None)
            .returning(DocumentVersion)
            .execution_options(synchronize_session=False, populate_existing=True)
        )
    ).scalar_one_or_none()
    if version is None:
        raise NotFound("Version not found")
    username = await db.scalar(select(User.username).where(User.id == version.created_by))
    return _out(version, username)


async def remove(db: AsyncSession, plan_id: int, version_id: int, user_id: str) -> None:
    await _require_access(db, plan_id, user_id)
    result = await db.execute(
        delete(DocumentVersion).where(DocumentVersion.id == version_id, DocumentVersion.plan_id == plan_id)
    )
    if not result.rowcount:
        raise NotFound("Version not found")
