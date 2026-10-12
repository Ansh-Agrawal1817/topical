"""Administrative commands: ``python -m backend.cli <command>``.

Small on purpose. These are the operations that have no place in the HTTP API
because no signed-in user should be able to perform them — setting somebody
else's password, and clearing out expired sessions — plus ``writing-check``,
for measuring what the AI writes while its prompts are being tuned.
"""

from __future__ import annotations

import argparse
import asyncio
import getpass
import sys
from datetime import datetime, timezone

from sqlalchemy import delete, select

from .auth.passwords import hash_password, password_problem
from .db.models import AuthSession, User, new_user_id, normalize_email
from .db.session import session_factory


def _require_db():
    if session_factory is None:
        sys.exit("DATABASE_URL is not set.")
    return session_factory


async def set_password(email: str, password: str | None, *, create: bool) -> None:
    """Give an account a password.

    The path back in for accounts that predate in-house authentication: they
    carry a profile and their documents, but no password, so nothing can sign
    them in until this is run.
    """
    factory = _require_db()
    address = normalize_email(email)
    password = password or getpass.getpass(f"New password for {address}: ")

    problem = password_problem(password)
    if problem:
        sys.exit(problem)

    async with factory() as db:
        user = (
            await db.execute(select(User).where(User.email == address).limit(1))
        ).scalar_one_or_none()

        if user is None:
            if not create:
                sys.exit(f"No account with email {address}. Pass --create to make one.")
            user = User(id=new_user_id(), email=address)
            db.add(user)

        user.password_hash = hash_password(password)
        user.updated_at = datetime.utcnow()

        # Any session opened under the old password is no longer trustworthy.
        await db.execute(delete(AuthSession).where(AuthSession.user_id == user.id))
        await db.commit()

    print(f"Password set for {address}.")


async def list_users() -> None:
    """Who exists, and whether they can sign in."""
    factory = _require_db()
    async with factory() as db:
        users = (await db.execute(select(User).order_by(User.created_at))).scalars().all()

    if not users:
        print("No accounts.")
        return

    print(f"{'email':40} {'username':20} password")
    for user in users:
        state = "set" if user.password_hash else "— cannot sign in"
        print(f"{user.email or '(none)':40} {user.username or '—':20} {state}")


async def prune_sessions() -> None:
    """Delete sessions that have already expired.

    Not required — expired sessions are dropped as they are encountered — but
    it keeps the table small on an installation with many lapsed logins.
    """
    factory = _require_db()
    async with factory() as db:
        result = await db.execute(
            delete(AuthSession).where(AuthSession.expires_at <= datetime.now(timezone.utc))
        )
        await db.commit()
    print(f"Removed {result.rowcount or 0} expired session(s).")


def _split_sections(text: str) -> list[tuple[str, str]]:
    """A Markdown document as (heading, own text) pairs, headings inside code fences ignored."""
    out: list[tuple[str, str]] = []
    title, body, fence = "(top)", [], False
    for line in text.split("\n"):
        if line.lstrip().startswith("```"):
            fence = not fence
        if not fence and line.startswith("#"):
            out.append((title, "\n".join(body)))
            title, body = line.lstrip("#").strip(), []
        else:
            body.append(line)
    out.append((title, "\n".join(body)))
    return [(t, b) for t, b in out if b.strip()]


def _print_report(rows: list[tuple[str, str]], fmt: str, checks: dict | None = None) -> None:
    from .services.ai.readability import overlap, report

    repeated = overlap([body for _, body in rows])
    for i, (title, body) in enumerate(rows):
        line = f"{title[:40]:40} {report(body, fmt).row()}  repeats {repeated[i]:4.0%}"
        if checks and checks.get(title):
            line += "  issues: " + ", ".join(checks[title])
        print(line)
    whole = report("\n\n".join(body for _, body in rows), fmt)
    print(f"{'WHOLE':40} {whole.row()}")


async def writing_check(path: str | None, topic: str | None, sections: list[str], provider: str, model: str,
                        fmt: str) -> None:
    """Score a document, or write sections with a real model and score those.

    Reading ease is Flesch: 60-70 is plain English, 30-50 college text, below
    30 academic. "repeats" is how much of a section's wording already
    appeared in an earlier one.
    """
    if path:
        with open(path, encoding="utf-8") as handle:
            _print_report(_split_sections(handle.read()), fmt)
        return

    import os

    from .schemas.ai import GenerateSectionRequest
    from .services.ai import generation
    from .services.ai.providers import build_credentials

    key = os.environ.get("TOPICAL_AI_KEY", "")
    credentials = build_credentials(provider, model, key)
    outline = "\n".join(f"{i + 1}. {name}" for i, name in enumerate(sections))
    rows: list[tuple[str, str]] = []
    for i, name in enumerate(sections):
        marked = "\n".join(
            f"{j + 1}. {other}" + (" [written]" if j < i else " [not written yet]")
            + ("   <-- the section you are writing now" if j == i else "")
            for j, other in enumerate(sections)
        )
        req = GenerateSectionRequest(topic=name, main_topic=topic or "", format=fmt, level=2, hierarchy=marked,
                                     section_number=str(i + 1))
        text = await generation.generate_section(req, credentials=credentials)
        rows.append((name, text))
        print(f"\n===== {name} =====\n{text}\n")
    print(f"\nOutline:\n{outline}\n")
    _print_report(rows, fmt)


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m backend.cli", description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)

    set_pw = commands.add_parser("set-password", help="set or reset an account's password")
    set_pw.add_argument("email")
    set_pw.add_argument("--password", help="read from a prompt when omitted")
    set_pw.add_argument("--create", action="store_true", help="create the account if absent")

    commands.add_parser("list-users", help="list accounts and whether they can sign in")
    commands.add_parser("prune-sessions", help="delete expired sessions")

    check = commands.add_parser(
        "writing-check",
        help="score a Markdown document, or write sections with a model (key in TOPICAL_AI_KEY) and score them",
    )
    check.add_argument("file", nargs="?", help="a Markdown file to score; omit to generate")
    check.add_argument("--topic", help="the document's subject, when generating")
    check.add_argument("--sections", default="", help="comma-separated section titles to write")
    check.add_argument("--provider", default="gemini")
    check.add_argument("--model", default="")
    check.add_argument("--format", default="mdx", choices=["mdx", "latex"])

    args = parser.parse_args()

    if args.command == "set-password":
        asyncio.run(set_password(args.email, args.password, create=args.create))
    elif args.command == "list-users":
        asyncio.run(list_users())
    elif args.command == "prune-sessions":
        asyncio.run(prune_sessions())
    elif args.command == "writing-check":
        if not args.file and not (args.topic and args.sections):
            sys.exit("Give a file to score, or --topic and --sections to generate.")
        sections = [name.strip() for name in args.sections.split(",") if name.strip()]
        asyncio.run(writing_check(args.file, args.topic, sections, args.provider, args.model, args.format))


if __name__ == "__main__":
    main()
