"""FastAPI entrypoint."""
from __future__ import annotations

import logging

import structlog
from fastapi import FastAPI

from apps.api.config import get_settings
from apps.api.webhooks import meta as meta_webhook


def _configure_logging(level: str) -> None:
    logging.basicConfig(level=level.upper())
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            structlog.processors.JSONRenderer(),
        ]
    )


def create_app() -> FastAPI:
    settings = get_settings()
    _configure_logging(settings.log_level)

    app = FastAPI(title="ContourAI API", version="0.1.0")
    app.include_router(meta_webhook.router)

    @app.get("/healthz")
    async def healthz() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
