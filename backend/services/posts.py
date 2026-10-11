"""The community forum: posts, votes and comments.

Nothing here is linked at the schema level — a vote carries a ``post_id`` with
no foreign key behind it — so each write checks the post exists first, and
deleting a post takes its votes and comments with it. An orphaned row is
invisible and permanent.
"""

from __future__ import annotations

from typing import Literal, Optional, Sequence

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.errors import Forbidden, NotFound
from ..db.models import Post, PostComment, PostVote, User

SortMode = Literal["latest", "top"]

#: A standing vote: up, down, or none.
VoteValue = int


def _tally(value: VoteValue, side: int) -> int:
    """1 when this vote counts toward ``side``'s total, else 0."""
    return 1 if value == side else 0


async def list_posts(db: AsyncSession, sort: SortMode = "latest") -> Sequence[Post]:
    order = Post.upvotes.desc() if sort == "top" else Post.created_at.desc()
    return (await db.execute(select(Post).order_by(order))).scalars().all()


async def get_post(db: AsyncSession, post_id: int) -> Post:
    post = (
        await db.execute(select(Post).where(Post.id == post_id).limit(1))
    ).scalar_one_or_none()
    if post is None:
        raise NotFound("Post not found")
    return post


async def comments_for(db: AsyncSession, post_id: int) -> Sequence[PostComment]:
    return (
        (
            await db.execute(
                select(PostComment)
                .where(PostComment.post_id == post_id)
                .order_by(PostComment.created_at.desc())
            )
        )
        .scalars()
        .all()
    )


async def create_post(
    db: AsyncSession,
    author: User,
    *,
    title: str,
    body: str,
    lesson_plan_id: Optional[int],
    lesson_plan_name: Optional[str],
) -> Post:
    post = Post(
        user_id=author.id,
        author_name=display_name(author),
        title=title,
        body=body,
        lesson_plan_id=lesson_plan_id,
        lesson_plan_name=lesson_plan_name,
    )
    db.add(post)
    # Every column is given or has a Python-side default, so the flushed object
    # is already complete — a refresh would only read back what was written.
    await db.flush()
    return post


def display_name(user: User) -> str:
    """The name a byline shows: given name, else email handle, else "Member"."""
    if user.given_name and user.given_name.strip():
        return user.given_name.strip()
    if user.email and "@" in user.email:
        return user.email.split("@", 1)[0]
    return "Member"


async def cast_vote(db: AsyncSession, post_id: int, user_id: str, vote: int) -> Post:
    """Record a vote and return the post with its adjusted counts.

    Voting the same way twice clears the vote; voting the other way switches
    it. Both counters are then adjusted by the difference between the old state
    and the new one, in a single statement whose RETURNING is the post the
    caller gets back — and whose empty result is the 404, so no vote is ever
    written against a post that does not exist (the transaction rolls back).

    Three round trips. It was seven: a SELECT for the 404, the vote lookup, the
    vote write, the count UPDATE, then the same post selected and refreshed.
    """
    existing = (
        await db.execute(
            select(PostVote).where(PostVote.post_id == post_id, PostVote.user_id == user_id).limit(1)
        )
    ).scalar_one_or_none()

    before: VoteValue = existing.vote if existing else 0
    after: VoteValue = 0 if before == vote else vote

    post = (
        await db.execute(
            update(Post)
            .where(Post.id == post_id)
            .values(
                # GREATEST floors at zero: a count that drifted negative —
                # which a half-applied vote in an older version could do —
                # renders as "-1 upvotes".
                upvotes=func.greatest(Post.upvotes + (_tally(after, 1) - _tally(before, 1)), 0),
                downvotes=func.greatest(Post.downvotes + (_tally(after, -1) - _tally(before, -1)), 0),
            )
            .returning(Post)
            .execution_options(synchronize_session=False, populate_existing=True)
        )
    ).scalar_one_or_none()
    if post is None:
        raise NotFound("Post not found")

    if after == 0 and existing is not None:
        await db.execute(delete(PostVote).where(PostVote.id == existing.id))
    elif existing is not None:
        existing.vote = after
    else:
        db.add(PostVote(post_id=post_id, user_id=user_id, vote=after))
    return post


async def add_comment(db: AsyncSession, post_id: int, author: User, body: str) -> PostComment:
    """The count goes up first, and its empty RETURNING is the 404 — one
    statement where there were two, and no comment written to a missing post."""
    counted = (
        await db.execute(
            update(Post)
            .where(Post.id == post_id)
            .values(comment_count=Post.comment_count + 1)
            .returning(Post.id)
        )
    ).scalar_one_or_none()
    if counted is None:
        raise NotFound("Post not found")

    comment = PostComment(
        post_id=post_id, user_id=author.id, author_name=display_name(author), body=body
    )
    db.add(comment)
    await db.flush()
    return comment


async def delete_post(db: AsyncSession, post_id: int, user_id: str) -> None:
    """Only the author may delete. Votes and comments go too."""
    post = await get_post(db, post_id)
    if post.user_id != user_id:
        raise Forbidden("You can only delete your own posts")

    await db.execute(delete(PostComment).where(PostComment.post_id == post_id))
    await db.execute(delete(PostVote).where(PostVote.post_id == post_id))
    await db.execute(delete(Post).where(Post.id == post_id))


async def delete_comment(db: AsyncSession, post_id: int, comment_id: int, user_id: str) -> None:
    comment = (
        await db.execute(
            select(PostComment)
            .where(PostComment.id == comment_id, PostComment.post_id == post_id)
            .limit(1)
        )
    ).scalar_one_or_none()
    if comment is None:
        raise NotFound("Comment not found")
    if comment.user_id != user_id:
        raise Forbidden("You can only delete your own comments")

    await db.execute(delete(PostComment).where(PostComment.id == comment_id))
    # Floor at zero: a count that drifted negative would render as "-1 comments".
    await db.execute(
        update(Post)
        .where(Post.id == post_id)
        .values(comment_count=func.greatest(Post.comment_count - 1, 0))
    )
