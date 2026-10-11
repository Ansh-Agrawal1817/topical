"""Attempt limits for the endpoints a password can be guessed through.

Nothing slowed down guessing before: a script could try passwords against an
account as fast as the hashing allowed. These are fixed windows held in this
process's memory — the app runs as one process, and a restart that forgets the
counts is an acceptable cost for not needing a store.
"""

from __future__ import annotations

import time
from typing import Dict, Tuple

from fastapi import Request

from .config import settings
from .errors import AppError


class Limiter:
    """At most ``attempts`` per key in any ``window`` seconds."""

    def __init__(self, attempts: int, window: int) -> None:
        self.attempts = attempts
        self.window = window
        self._hits: Dict[str, Tuple[float, int]] = {}

    def check(self, *keys: str) -> None:
        """Count an attempt against every key; 429 if any is over its limit."""
        now = time.monotonic()
        if len(self._hits) > 10_000:
            self._hits = {k: v for k, v in self._hits.items() if now - v[0] < self.window}
        for key in keys:
            start, count = self._hits.get(key, (now, 0))
            if now - start >= self.window:
                start, count = now, 0
            if count >= self.attempts:
                wait = int(self.window - (now - start)) + 1
                raise AppError(
                    "Too many attempts. Wait a few minutes and try again.",
                    429,
                    headers={"Retry-After": str(wait)},
                )
            self._hits[key] = (start, count + 1)

    def clear(self, key: str) -> None:
        self._hits.pop(key, None)


def client_ip(request: Request) -> str:
    """The caller's address. Behind Fly's proxy that is ``Fly-Client-IP``,
    which the proxy sets itself; anywhere else the header is not trusted."""
    if settings.is_production:
        forwarded = request.headers.get("fly-client-ip")
        if forwarded:
            return forwarded
    return request.client.host if request.client else "unknown"


#: Sign-in: per account and per address, so neither one account nor one
#: machine can be ground through.
login_attempts = Limiter(attempts=10, window=15 * 60)
login_by_ip = Limiter(attempts=40, window=15 * 60)
#: Accounts created from one address.
registrations = Limiter(attempts=5, window=60 * 60)
#: Current-password checks on a signed-in session.
password_changes = Limiter(attempts=10, window=15 * 60)
