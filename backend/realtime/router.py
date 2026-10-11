"""The collaboration socket: ``/ws/doc/{doc_id}``.

Deliberately thin. Everything about the protocol lives in ``yjs.py``; this is
the FastAPI endpoint that owns one connection's lifetime and hands its frames
over.
"""

from __future__ import annotations

import logging

from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status
from sqlalchemy import select

from ..auth.session import SESSION_COOKIE, resolve_session
from ..db import session as db
from ..db.models import LessonPlan
from ..services.lesson_plans import writable_by
from .yjs import rooms

logger = logging.getLogger(__name__)

router = APIRouter()


async def _may_edit(websocket: WebSocket, doc_id: str) -> bool:
    """Whether the socket's session belongs to someone who may write this document.

    The room carries the document's live text in both directions: joining it
    hands over the whole current state, and anything sent into it reaches the
    authors' editors — and from there their autosave. So it is held to the same
    rule as writing through the API: the owner, or a co-author. It used to
    accept anyone who could guess an id, and the ids count up from 1.
    """
    if not doc_id.isdigit() or db.read_session_factory is None:
        return False
    token: Optional[str] = websocket.cookies.get(SESSION_COOKIE)
    async with db.read_session_factory() as session:
        user = await resolve_session(session, token)
        if user is None:
            return False
        found = (
            await session.execute(
                select(LessonPlan.id).where(LessonPlan.id == int(doc_id), writable_by(user.id)).limit(1)
            )
        ).scalar_one_or_none()
        return found is not None


@router.websocket("/ws/doc/{doc_id}")
async def document_socket(websocket: WebSocket, doc_id: str) -> None:
    """Join a document room for as long as the socket is open — if allowed to."""
    if not await _may_edit(websocket, doc_id):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Not allowed")
        return

    await websocket.accept()
    room = rooms.get_or_create(doc_id)
    await room.join(websocket, websocket.send_bytes)

    try:
        while True:
            message = await websocket.receive()

            if message["type"] == "websocket.disconnect":
                break

            data = message.get("bytes")
            if data is None:
                # The Yjs protocol is binary-only, so a text frame is a
                # misbehaving client rather than something to interpret.
                continue

            await room.handle(websocket, data)

    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("collaboration socket for %r failed", doc_id)
    finally:
        await room.leave(websocket)
        rooms.release(doc_id)
