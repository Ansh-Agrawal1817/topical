"""A document's history: snapshots on branches, and moving between them.

History is a graph. Every snapshot is taken on top of the newest version of
the branch the document is on (its ``parent``), so a branch reads as a chain;
forking starts a new branch from any version, and the document can be moved
onto it and back. A restore and a merge each add a version on top of the
current branch — nothing is rewritten, so every step is itself in the history.

Moving the page is the client's job: these functions decide what the page
should now say and record the step, and the editor puts the text in front of
everyone through the live document. That keeps collaborators, undo and
autosave on the one path every other edit takes.

Who may see a document's history is who may write it — the same
``writable_by`` rule. History holds text that was later deleted, sometimes on
purpose, so a reader of a published document does not get it.
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import delete, exists, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.errors import AppError, Conflict, NotFound
from ..db.models import DocumentBranch, DocumentVersion, LessonPlan, User
from ..schemas.version import (
    BranchOut, ForkInput, PageChange, VersionCreated, VersionDetail, VersionInput, VersionList, VersionOut,
)
from .lesson_plans import writable_by

#: One automatic snapshot per this much time, whoever is writing.
AUTO_INTERVAL = timedelta(minutes=10)
#: Automatic snapshots kept per branch; named and other kinds are not pruned.
AUTO_KEEP = 100
#: How many the history lists.
LIST_LIMIT = 400
#: What a document's first branch is called.
MAIN = "main"

_WORD = re.compile(r"[\w'’-]+")


def _words(text: str) -> int:
    return len(_WORD.findall(text))


async def _require_access(db: AsyncSession, plan_id: int, user_id: str) -> LessonPlan:
    plan = (
        await db.execute(select(LessonPlan).where(LessonPlan.id == plan_id, writable_by(user_id)).limit(1))
    ).scalar_one_or_none()
    if plan is None:
        raise NotFound("Lesson plan not found")
    return plan


async def _username(db: AsyncSession, user_id: str) -> Optional[str]:
    return await db.scalar(select(User.username).where(User.id == user_id))


def _out(version: DocumentVersion, username: Optional[str], detail: bool = False) -> VersionOut:
    model = (VersionDetail if detail else VersionOut).model_validate(version)
    model.createdByUsername = username
    return model


async def _current_branch(db: AsyncSession, plan: LessonPlan, user_id: str) -> DocumentBranch:
    """The branch the document is on — "main", made now, for a document that has none yet."""
    if plan.current_branch_id is not None:
        branch = await db.get(DocumentBranch, plan.current_branch_id)
        if branch is not None:
            return branch
    # A document with no branch: its history so far (if any) becomes "main".
    newest = await db.scalar(
        select(DocumentVersion.id).where(DocumentVersion.plan_id == plan.id)
        .order_by(DocumentVersion.created_at.desc(), DocumentVersion.id.desc()).limit(1)
    )
    branch = DocumentBranch(
        plan_id=plan.id, name=MAIN, head_version_id=newest, created_by=user_id, created_at=datetime.utcnow(),
    )
    db.add(branch)
    await db.flush()
    await db.execute(
        update(DocumentVersion)
        .where(DocumentVersion.plan_id == plan.id, DocumentVersion.branch_id.is_(None))
        .values(branch_id=branch.id)
    )
    plan.current_branch_id = branch.id
    await db.flush()
    return branch


async def _head(db: AsyncSession, branch: DocumentBranch) -> Optional[DocumentVersion]:
    return await db.get(DocumentVersion, branch.head_version_id) if branch.head_version_id else None


async def _add(
    db: AsyncSession, plan: LessonPlan, branch: DocumentBranch, user_id: str, *, content: str, kind: str,
    name: Optional[str] = None, source: str = "human", merged_from: Optional[int] = None,
    restored_from: Optional[int] = None,
) -> DocumentVersion:
    """A new version on top of `branch`, which it becomes the head of."""
    version = DocumentVersion(
        plan_id=plan.id, branch_id=branch.id, parent_id=branch.head_version_id, name=(name or "").strip() or None,
        kind=kind, content=content, words=_words(content), created_by=user_id, created_at=datetime.utcnow(),
        source=source, merged_from_id=merged_from, restored_from_id=restored_from,
    )
    db.add(version)
    await db.flush()
    branch.head_version_id = version.id
    await db.flush()
    return version


async def _keep_page(
    db: AsyncSession, plan: LessonPlan, branch: DocumentBranch, user_id: str, content: str, kind: str, name: str,
) -> Optional[DocumentVersion]:
    """Keep the page as it is before something replaces it — unless the branch's newest version already has it."""
    head = await _head(db, branch)
    if not content.strip() or (head is not None and head.content == content):
        return None
    return await _add(db, plan, branch, user_id, content=content, kind=kind, name=name)


def _label(version: DocumentVersion) -> str:
    if version.name:
        return version.name
    stamp = version.created_at.strftime("%d %b, %H:%M") if version.created_at else "an earlier version"
    return stamp


# ── Reading ──────────────────────────────────────────────────────────────
async def list_versions(db: AsyncSession, plan_id: int, user_id: str) -> VersionList:
    """Every version (newest first, without text), every branch, and which one the document is on."""
    plan = await _require_access(db, plan_id, user_id)
    has_history = plan.current_branch_id is not None or await db.scalar(
        select(exists().where(DocumentVersion.plan_id == plan_id))
    )
    current = await _current_branch(db, plan, user_id) if has_history else None
    rows = (
        await db.execute(
            select(
                DocumentVersion.id, DocumentVersion.name, DocumentVersion.kind, DocumentVersion.words,
                DocumentVersion.created_by, DocumentVersion.created_at, DocumentVersion.branch_id,
                DocumentVersion.parent_id, DocumentVersion.merged_from_id, DocumentVersion.restored_from_id,
                DocumentVersion.source, User.username,
            )
            .outerjoin(User, DocumentVersion.created_by == User.id)
            .where(DocumentVersion.plan_id == plan_id)
            .order_by(DocumentVersion.created_at.desc(), DocumentVersion.id.desc())
            .limit(LIST_LIMIT)
        )
    ).all()
    branches = (
        await db.execute(
            select(DocumentBranch).where(DocumentBranch.plan_id == plan_id).order_by(DocumentBranch.id)
        )
    ).scalars().all()
    return VersionList(
        versions=[
            VersionOut(
                id=row.id, name=row.name, kind=row.kind, words=row.words, createdBy=row.created_by,
                createdAt=row.created_at, createdByUsername=row.username, branchId=row.branch_id,
                parentId=row.parent_id, mergedFromId=row.merged_from_id, restoredFromId=row.restored_from_id,
                source=row.source,
            )
            for row in rows
        ],
        branches=[BranchOut.model_validate(branch) for branch in branches],
        currentBranchId=current.id if current else None,
    )


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


async def _version(db: AsyncSession, plan_id: int, version_id: int) -> DocumentVersion:
    version = await db.get(DocumentVersion, version_id)
    if version is None or version.plan_id != plan_id:
        raise NotFound("Version not found")
    return version


async def _branch(db: AsyncSession, plan_id: int, branch_id: int) -> DocumentBranch:
    branch = await db.get(DocumentBranch, branch_id)
    if branch is None or branch.plan_id != plan_id:
        raise NotFound("Branch not found")
    return branch


# ── Taking snapshots ─────────────────────────────────────────────────────
async def take(db: AsyncSession, plan_id: int, payload: VersionInput, user_id: str) -> VersionCreated:
    """Add a snapshot to the branch the document is on, or decline one that would add nothing.

    An automatic snapshot is skipped when the branch's newest version already
    holds this exact text, when another automatic one was taken on the branch
    within the interval — two collaborators' browsers both asking every ten
    minutes should still leave one row per ten minutes — or when the client
    is still writing to a branch the document has since left.
    """
    plan = await _require_access(db, plan_id, user_id)
    branch = await _current_branch(db, plan, user_id)
    if payload.branchId is not None and payload.branchId != branch.id and payload.kind == "auto":
        return VersionCreated(version=None, currentBranchId=branch.id)
    if payload.kind != "manual":
        if not payload.content.strip():
            return VersionCreated(version=None, currentBranchId=branch.id)
        head = await _head(db, branch)
        if head is not None:
            recent = head.created_at and datetime.utcnow() - head.created_at < AUTO_INTERVAL
            if head.content == payload.content and payload.kind != "merge":
                return VersionCreated(version=None, currentBranchId=branch.id)
            if payload.kind == "auto" and recent and head.kind == "auto" and head.branch_id == branch.id:
                return VersionCreated(version=None, currentBranchId=branch.id)
    merged_from = None
    if payload.mergedFromId is not None:
        merged_from = (await _version(db, plan_id, payload.mergedFromId)).id

    version = await _add(
        db, plan, branch, user_id, content=payload.content, kind=payload.kind, name=payload.name,
        source=payload.source, merged_from=merged_from,
    )
    if payload.kind == "auto":
        await _prune(db, branch)
    return VersionCreated(version=_out(version, await _username(db, user_id)), currentBranchId=branch.id)


# ── Changing the page ────────────────────────────────────────────────────
async def restore(db: AsyncSession, plan_id: int, version_id: int, page: str, user_id: str) -> PageChange:
    """Bring an older version back, as a new version on top of the current branch.

    The page as it stands is kept first, so the restore is one more step
    in the history rather than a jump that loses where the document was.
    """
    plan = await _require_access(db, plan_id, user_id)
    branch = await _current_branch(db, plan, user_id)
    source = await _version(db, plan_id, version_id)
    label = _label(source)
    await _keep_page(db, plan, branch, user_id, page, "checkpoint", f"Before restoring “{label}”"[:120])
    version = await _add(
        db, plan, branch, user_id, content=source.content, kind="restore", restored_from=source.id,
        name=f"Restored “{label}”"[:120],
    )
    return PageChange(
        content=source.content, currentBranchId=branch.id, version=_out(version, await _username(db, user_id)),
    )


async def _unique_name(db: AsyncSession, plan_id: int, wanted: str) -> str:
    taken = set(
        (await db.execute(select(func.lower(DocumentBranch.name)).where(DocumentBranch.plan_id == plan_id)))
        .scalars().all()
    )
    name = wanted.strip()[:80] or "Branch"
    n = 2
    while name.lower() in taken:
        name = f"{wanted.strip()[:74]} {n}"
        n += 1
    return name


async def fork(db: AsyncSession, plan_id: int, payload: ForkInput, user_id: str) -> PageChange:
    """Start a branch from any version; by default the document moves onto it."""
    plan = await _require_access(db, plan_id, user_id)
    current = await _current_branch(db, plan, user_id)
    base = await _version(db, plan_id, payload.fromVersionId)
    branch = DocumentBranch(
        plan_id=plan_id, name=await _unique_name(db, plan_id, payload.name), head_version_id=base.id,
        created_by=user_id, created_at=datetime.utcnow(),
    )
    db.add(branch)
    await db.flush()
    if not payload.switch:
        return PageChange(content=payload.content, currentBranchId=current.id, branch=BranchOut.model_validate(branch))
    await _keep_page(db, plan, current, user_id, payload.content, "switch", f"Left for “{branch.name}”"[:120])
    plan.current_branch_id = branch.id
    await db.flush()
    return PageChange(content=base.content, currentBranchId=branch.id, branch=BranchOut.model_validate(branch))


async def checkout(db: AsyncSession, plan_id: int, branch_id: int, page: str, user_id: str) -> PageChange:
    """Move the document onto another branch: keep the page on the one it leaves, show the other's newest."""
    plan = await _require_access(db, plan_id, user_id)
    current = await _current_branch(db, plan, user_id)
    target = await _branch(db, plan_id, branch_id)
    head = await _head(db, target)
    if head is None:
        raise AppError("That branch has no versions to show.", 409)
    if target.id != current.id:
        await _keep_page(db, plan, current, user_id, page, "switch", f"Left for “{target.name}”"[:120])
        plan.current_branch_id = target.id
        await db.flush()
    return PageChange(content=head.content, currentBranchId=target.id, branch=BranchOut.model_validate(target))


async def rename_branch(db: AsyncSession, plan_id: int, branch_id: int, name: str, user_id: str) -> BranchOut:
    await _require_access(db, plan_id, user_id)
    branch = await _branch(db, plan_id, branch_id)
    clean = name.strip()[:80]
    if clean.lower() != branch.name.lower():
        clean = await _unique_name(db, plan_id, clean)
    branch.name = clean
    await db.flush()
    return BranchOut.model_validate(branch)


async def delete_branch(db: AsyncSession, plan_id: int, branch_id: int, user_id: str) -> None:
    """Remove a branch and its versions — not the one the document is on, nor one another branch grew from."""
    plan = await _require_access(db, plan_id, user_id)
    branch = await _branch(db, plan_id, branch_id)
    if plan.current_branch_id == branch.id:
        raise Conflict("The document is on this branch. Switch to another branch first.")
    own = select(DocumentVersion.id).where(DocumentVersion.branch_id == branch.id)
    grown = await db.scalar(select(exists().where(
        DocumentVersion.parent_id.in_(own), DocumentVersion.branch_id != branch.id,
    ))) or await db.scalar(select(exists().where(
        DocumentBranch.id != branch.id, DocumentBranch.head_version_id.in_(own),
    )))
    if grown:
        raise Conflict("Another branch was forked from this one. Delete that branch first.")
    await db.execute(delete(DocumentVersion).where(DocumentVersion.branch_id == branch.id))
    await db.execute(delete(DocumentBranch).where(DocumentBranch.id == branch.id))


# ── Naming and removing versions ─────────────────────────────────────────
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
    return _out(version, await _username(db, version.created_by))


async def _is_fork_point(db: AsyncSession, version: DocumentVersion) -> bool:
    """Whether another branch grows from this version."""
    child_elsewhere = await db.scalar(select(exists().where(
        DocumentVersion.parent_id == version.id, DocumentVersion.branch_id != version.branch_id,
    )))
    head_elsewhere = await db.scalar(select(exists().where(
        DocumentBranch.head_version_id == version.id, DocumentBranch.id != version.branch_id,
    )))
    return bool(child_elsewhere or head_elsewhere)


async def _unlink(db: AsyncSession, version: DocumentVersion) -> None:
    """Take a version out of the graph, joining its children to its parent so nothing is cut loose."""
    await db.execute(
        update(DocumentVersion).where(DocumentVersion.parent_id == version.id).values(parent_id=version.parent_id)
    )
    await db.execute(
        update(DocumentBranch).where(DocumentBranch.head_version_id == version.id)
        .values(head_version_id=version.parent_id)
    )
    await db.execute(delete(DocumentVersion).where(DocumentVersion.id == version.id))


async def remove(db: AsyncSession, plan_id: int, version_id: int, user_id: str) -> None:
    await _require_access(db, plan_id, user_id)
    version = await _version(db, plan_id, version_id)
    if await _is_fork_point(db, version):
        raise Conflict("A branch starts from this version, so it stays. Delete that branch first.")
    await _unlink(db, version)


async def _prune(db: AsyncSession, branch: DocumentBranch) -> None:
    """Keep the newest AUTO_KEEP unnamed automatic snapshots on a branch; never a head or a fork point."""
    stale = (
        await db.execute(
            select(DocumentVersion)
            .where(DocumentVersion.branch_id == branch.id, DocumentVersion.kind == "auto",
                   DocumentVersion.name.is_(None))
            .order_by(DocumentVersion.created_at.desc(), DocumentVersion.id.desc())
            .offset(AUTO_KEEP)
        )
    ).scalars().all()
    for version in stale:
        if version.id != branch.head_version_id and not await _is_fork_point(db, version):
            await _unlink(db, version)
