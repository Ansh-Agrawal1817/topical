"""The application: what it is made of, and the order it is assembled in.

One process now serves what three used to — the API, the collaboration socket,
the AI generation that had its own port and its own proxy hop, and the built
frontend. Each of those is a package with its own module; this file only wires
them together.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

# `core.config` reads (and loads) the environment at import, so it comes first.
from .core.config import settings
from .api import api_router
from .core.errors import error_response, register_exception_handlers
from .core.logging import configure_logging
from .db.session import dispose_engine, is_configured, warm_pool
from .realtime import realtime_router
from .static import mount_frontend

logger = logging.getLogger(__name__)

#: The largest request body accepted: an image upload (5MB) plus form overhead.
MAX_BODY_BYTES = 8 * 1024 * 1024


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    logger.info(
        "starting on %s:%s (database %s)",
        settings.host,
        settings.port,
        "configured" if is_configured() else "NOT configured",
    )
    await warm_pool()
    yield
    await dispose_engine()


def create_app() -> FastAPI:
    """Build the application.

    A factory rather than a module-level singleton, so a test can build a
    second one with different settings instead of reaching into this one.
    """
    configure_logging()

    app = FastAPI(
        title="Topical",
        description="Documents, collaboration, community, and AI writing assistance.",
        version="2.0.0",
        lifespan=lifespan,
    )

    # Same-origin in every deployment — the frontend is served from this
    # process, and in development Vite proxies to it rather than calling
    # across origins. Credentials therefore ride on same-origin requests and
    # this stays closed.
    if not settings.is_production:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    # Documents travel whole — a workspace listing carries the full text of
    # every document — and in production the same process serves the
    # JavaScript bundles. Both went out uncompressed; prose and minified code
    # compress four- to six-fold. Websocket frames are not touched.
    app.add_middleware(GZipMiddleware, minimum_size=1024, compresslevel=6)

    @app.middleware("http")
    async def security_headers(request, call_next):
        """Headers every response carries.

        ``nosniff`` keeps a browser from reading a response as a type it was
        not sent as; ``DENY`` keeps the app out of other sites' frames, where a
        hidden one could be clicked through (nothing legitimate frames it);
        the referrer policy stops full document URLs leaking to the sites a
        document links to.
        """
        # Bodies are bounded: the largest legitimate one is a 5MB image
        # upload, and nothing else stopped a client sending gigabytes for the
        # server to buffer and parse.
        length = request.headers.get("content-length")
        if length and length.isdigit() and int(length) > MAX_BODY_BYTES:
            return error_response("Request too large", 413)
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        return response

    register_exception_handlers(app)

    app.include_router(api_router)
    app.include_router(realtime_router)

    @app.get("/health", include_in_schema=False)
    async def health() -> dict:
        return {"status": "ok", "database": is_configured()}

    # Last: its catch-all route would otherwise shadow everything above it.
    mount_frontend(app, settings.static_dir)

    return app


app = create_app()
