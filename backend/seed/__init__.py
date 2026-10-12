"""Demo content: people, published documents, and a community with some history.

``python -m backend.cli seed-demo`` adds it; ``--remove`` takes it out again.
Everything the seed creates is owned by an account whose email ends in
``@demo.example``, so removal deletes exactly that and nothing else — the
documents, posts, comments and votes of real accounts are never touched,
except that comments real people left on demo posts go with those posts.

Dates are spread back from the moment the seed runs, so the content always
looks recent. The text is in ``documents/`` and ``community/``.
"""

from __future__ import annotations

import random
import re
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List

from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import (
    DocumentBranch, DocumentVersion, LessonPlan, Post, PostComment, PostVote, User, new_user_id,
)
from .community import ALL_POSTS
from .people import DEMO_DOMAIN, PEOPLE

DOCUMENTS_DIR = Path(__file__).parent / "documents"
LATEX_PREFIX = "latex:"

#: slug → (owner, co-authors, created days ago, last edited days ago, title for LaTeX documents)
DOCUMENTS: Dict[str, tuple] = {
    "rates-of-reaction": ("mokafor", ["fatima_z"], 100, 95, None),
    "sequence-alignment": ("therrera", [], 90, 84, None),
    "raft-in-practice": ("priyar", ["wkowalski"], 96, 92, None),
    "idempotency-keys": ("priyar", [], 71, 68, None),
    "uniform-convergence": ("jlindqvist", [], 83, 61, "Uniform Convergence (Analysis II, weeks 5–6)"),
    "manchester-baby": ("dbrooks", [], 106, 101, None),
    "voice-leading": ("sakura_ito", [], 58, 54, None),
    "renal-sodium": ("hrezaei", [], 70, 66, None),
    "special-relativity": ("lfischer", [], 51, 47, "Special Relativity from Two Postulates"),
    "bayesian-ab-tests": ("mchen_data", [], 44, 40, None),
    "things-fall-apart-unit": ("aishabello", [], 65, 61, None),
    "recursion-year-12": ("ogrant", ["kmensah"], 77, 70, None),
    "phonemes-allophones": ("npetrova", [], 42, 38, None),
    "simply-supported-beam": ("ravi-iyer", [], 61, 57, None),
    "carbon-cycle-timescales": ("chloem", [], 47, 41, None),
    "typesetting-for-screens": ("elifkaya", [], 34, 31, None),
    "quadratics-completing-square": ("kmensah", [], 78, 74, None),
    "evaluating-sources": ("isolberg", [], 39, 35, None),
    "anchoring-notes": ("grace_a", [], 55, 52, None),
    "postmortem-cache-stampede": ("wkowalski", [], 26, 23, None),
}


def _demo(username: str) -> str:
    return f"{username}@{DEMO_DOMAIN}"


def _document(slug: str, latex_title: str | None) -> tuple[str, str, str]:
    """(name, format, content) for a document file.

    A Markdown document's opening `# Title` is its name, not a section: kept in
    the text it would become the one top-level row with everything else
    nested under it.
    """
    for fmt, ext in (("mdx", ".md"), ("latex", ".tex")):
        path = DOCUMENTS_DIR / f"{slug}{ext}"
        if path.exists():
            text = path.read_text(encoding="utf-8")
            if fmt == "latex":
                return latex_title or slug.replace("-", " ").title(), fmt, text.strip() + "\n"
            first, _, rest = text.partition("\n")
            match = re.match(r"#\s+(.+)", first)
            if not match:
                raise ValueError(f"{path.name} must start with a '# Title' line")
            name = re.sub(r"\*([^*]+)\*", r"\1", match.group(1)).strip()
            return name, fmt, rest.strip() + "\n"
    raise FileNotFoundError(slug)


async def is_seeded(db: AsyncSession) -> bool:
    count = await db.scalar(select(func.count()).select_from(User).where(User.email.like(f"%@{DEMO_DOMAIN}")))
    return bool(count)


#: Documents shared with ``--share-with``, so they appear in that person's projects.
SHARED = ["raft-in-practice", "sequence-alignment", "uniform-convergence", "bayesian-ab-tests",
          "carbon-cycle-timescales", "typesetting-for-screens", "rates-of-reaction", "postmortem-cache-stampede"]


def _drafts(content: str, fmt: str) -> List[str]:
    """Earlier states of a document: its first sections, then most of it, then all of it."""
    heading = re.compile(r"^(#{1,6}\s|\\(?:sub)*section\{)", re.M)
    starts = [m.start() for m in heading.finditer(content)] or [0]
    cut = lambda share: content[: starts[min(len(starts) - 1, max(1, int(len(starts) * share)))]].rstrip() + "\n"  # noqa: E731
    return [cut(0.35), cut(0.75), content]


async def _add_history(db: AsyncSession, plan: LessonPlan, owner: User, content: str, fmt: str,
                       created: datetime, edited: datetime, fork: bool) -> int:
    main = DocumentBranch(plan_id=plan.id, name="main", created_by=owner.id, created_at=created)
    db.add(main)
    await db.flush()
    steps = [("auto", None), ("manual", "First full draft"), ("auto", None)]
    span = (edited - created) / 3
    parent = None
    added = 0
    for i, (text, (kind, name)) in enumerate(zip(_drafts(content, fmt), steps)):
        version = DocumentVersion(
            plan_id=plan.id, branch_id=main.id, parent_id=parent, name=name, kind=kind, content=text,
            words=len(text.split()), created_by=owner.id, created_at=created + span * (i + 1), source="human",
        )
        db.add(version)
        await db.flush()
        parent = version.id
        added += 1
    main.head_version_id = parent
    plan.current_branch_id = main.id
    if fork:
        base = parent
        branch = DocumentBranch(plan_id=plan.id, name="Shorter edition", head_version_id=base,
                                created_by=owner.id, created_at=edited - timedelta(days=1))
        db.add(branch)
        await db.flush()
        paragraphs = content.split("\n\n")
        shorter = "\n\n".join(p for i, p in enumerate(paragraphs) if i % 5 != 3) + "\n"
        version = DocumentVersion(
            plan_id=plan.id, branch_id=branch.id, parent_id=base, name="Cut every fifth paragraph", kind="manual",
            content=shorter, words=len(shorter.split()), created_by=owner.id,
            created_at=edited - timedelta(hours=20), source="human",
        )
        db.add(version)
        await db.flush()
        branch.head_version_id = version.id
        added += 1
    await db.flush()
    return added


async def seed(db: AsyncSession, share_with: str | None = None) -> Dict[str, int]:
    """Add the demo people, documents and community. Refuses to run twice.

    ``share_with`` names an existing account to add as a co-author on a few
    documents, so they appear in that person's projects and can be opened in
    the editor (with their history). They stay owned by demo accounts.
    """
    if await is_seeded(db):
        raise RuntimeError("The demo content is already there. Remove it first with --remove (or use --reset).")
    now = datetime.utcnow().replace(microsecond=0)
    ago = lambda days, hours=0: now - timedelta(days=days, hours=hours)  # noqa: E731

    # ── People ──
    users: Dict[str, User] = {}
    for username, given, family, bio, joined in PEOPLE:
        user = User(
            id=new_user_id(), username=username, given_name=given, family_name=family, email=_demo(username),
            bio=bio or None, created_at=ago(joined), updated_at=ago(joined),
        )
        db.add(user)
        users[username] = user
    await db.flush()

    guest = None
    if share_with:
        guest = (await db.execute(select(User).where(User.username == share_with).limit(1))).scalar_one_or_none()
        if guest is None:
            raise RuntimeError(f"No account with the username {share_with!r} to share documents with.")

    # ── Documents, each with a short history ──
    plans: Dict[str, LessonPlan] = {}
    versions = 0
    for slug, (owner, co_authors, created, edited, latex_title) in DOCUMENTS.items():
        name, fmt, content = _document(slug, latex_title)
        main_topic = f"{LATEX_PREFIX}{name}" if fmt == "latex" else name
        shared = [users[c].id for c in co_authors] + ([guest.id] if guest and slug in SHARED else [])
        plan = LessonPlan(
            user_id=users[owner].id, name=name, main_topic=main_topic,
            topics=[{"topic": name, "mdxContent": content, "isSubtopic": False,
                     "parentTopic": name, "mainTopic": main_topic}],
            co_authors=shared, ai_collaborators=[], is_public=True,
            created_at=ago(created), updated_at=ago(edited),
        )
        db.add(plan)
        await db.flush()
        versions += await _add_history(db, plan, users[owner], content, fmt, ago(created), ago(edited),
                                       fork=slug == "raft-in-practice")
        plans[slug] = plan

    # ── Community ──
    posts = comments = votes = 0
    everyone = [username for username, *_ in PEOPLE]
    for spec in ALL_POSTS:
        author = users[spec["author"]]
        created = ago(spec["days_ago"], hours=random.Random(spec["title"]).randint(0, 10))
        doc = plans.get(spec.get("doc", ""))
        thread = spec.get("comments", [])
        up, down = spec.get("votes", (0, 0))
        post = Post(
            user_id=author.id, author_name=author.given_name, title=spec["title"], body=spec["body"].strip(),
            lesson_plan_id=doc.id if doc else None, lesson_plan_name=doc.name if doc else None,
            upvotes=up, downvotes=down, comment_count=len(thread), created_at=created,
        )
        db.add(post)
        await db.flush()
        posts += 1

        for who, hours, body in thread:
            when = min(created + timedelta(hours=hours, minutes=random.Random(body).randint(0, 59)),
                       now - timedelta(minutes=5))
            db.add(PostComment(post_id=post.id, user_id=users[who].id, author_name=users[who].given_name,
                               body=body.strip(), created_at=when))
            comments += 1

        # Voters drawn deterministically from everyone but the author, so the
        # tally on the post and the rows behind it agree.
        voters = [u for u in everyone if u != spec["author"]]
        random.Random(f"votes:{spec['title']}").shuffle(voters)
        if up + down > len(voters):
            raise ValueError(f"Too many votes for {spec['title']!r}")
        for i, who in enumerate(voters[: up + down]):
            db.add(PostVote(post_id=post.id, user_id=users[who].id, vote=1 if i < up else -1))
            votes += 1

    await db.flush()
    return {"people": len(users), "documents": len(plans), "versions": versions, "posts": posts,
            "comments": comments, "votes": votes, "shared with you": len(SHARED) if guest else 0}


async def remove(db: AsyncSession) -> Dict[str, int]:
    """Delete everything the seed added, and nothing else."""
    demo_ids = select(User.id).where(User.email.like(f"%@{DEMO_DOMAIN}"))
    demo_posts = select(Post.id).where(Post.user_id.in_(demo_ids))
    counts: Dict[str, int] = {}
    counts["votes"] = (await db.execute(delete(PostVote).where(
        or_(PostVote.user_id.in_(demo_ids), PostVote.post_id.in_(demo_posts))))).rowcount
    counts["comments"] = (await db.execute(delete(PostComment).where(
        or_(PostComment.user_id.in_(demo_ids), PostComment.post_id.in_(demo_posts))))).rowcount
    counts["posts"] = (await db.execute(delete(Post).where(Post.user_id.in_(demo_ids)))).rowcount
    counts["documents"] = (await db.execute(delete(LessonPlan).where(LessonPlan.user_id.in_(demo_ids)))).rowcount
    counts["people"] = (await db.execute(delete(User).where(User.email.like(f"%@{DEMO_DOMAIN}")))).rowcount
    return counts


def summary() -> List[str]:
    """What the seed would add, for a dry run."""
    words = 0
    for slug, (_, _, _, _, latex_title) in DOCUMENTS.items():
        words += len(_document(slug, latex_title)[2].split())
    thread = sum(len(p.get("comments", [])) for p in ALL_POSTS)
    return [
        f"{len(PEOPLE)} people",
        f"{len(DOCUMENTS)} published documents ({words:,} words)",
        f"{len(ALL_POSTS)} posts with {thread} comments",
    ]
