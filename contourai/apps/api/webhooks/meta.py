"""Meta (Instagram + Facebook DM) webhook handler.

Contract:
- GET  /webhooks/meta  → subscription verification
- POST /webhooks/meta  → inbound messages (verify signature, ack < 10s,
                         process async)
"""
from __future__ import annotations

from datetime import datetime, timezone

import structlog
from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, Request, Response

from apps.api.config import get_settings
from apps.api.schemas.inbound import InboundMessage
from apps.api.services.meta import verify_signature

log = structlog.get_logger(__name__)
router = APIRouter(prefix="/webhooks/meta", tags=["meta"])


@router.get("")
async def verify(
    hub_mode: str = Query(alias="hub.mode"),
    hub_challenge: str = Query(alias="hub.challenge"),
    hub_verify_token: str = Query(alias="hub.verify_token"),
) -> Response:
    settings = get_settings()
    if hub_mode == "subscribe" and hub_verify_token == settings.meta_verify_token:
        return Response(content=hub_challenge, media_type="text/plain")
    raise HTTPException(status_code=403, detail="verify_token mismatch")


@router.post("")
async def receive(request: Request, background: BackgroundTasks) -> dict[str, str]:
    raw = await request.body()
    if not verify_signature(
        body=raw, signature_header=request.headers.get("X-Hub-Signature-256")
    ):
        raise HTTPException(status_code=401, detail="bad_signature")

    payload = await request.json()
    inbounds = _parse(payload)
    for inbound in inbounds:
        # Import inside the function to keep the webhook handler trivially
        # testable without spinning up the full agent stack.
        from apps.api.agent_loop import handle_inbound
        background.add_task(handle_inbound, inbound)

    return {"status": "ok"}


def _parse(payload: dict) -> list[InboundMessage]:
    """Best-effort translation of Meta's nested payload into InboundMessages.
    Supports Instagram (`object="instagram"`) and Page DMs (`object="page"`).
    """
    out: list[InboundMessage] = []
    # Meta delivers Instagram DMs under object="instagram" and Page (FB)
    # DMs under object="page". We model both as IG for v1 since the contract
    # is identical; revisit if FB-page-specific behavior diverges.
    channel = "instagram"
    for entry in payload.get("entry", []):
        page_id = entry.get("id", "")
        for msg in entry.get("messaging", []):
            message = msg.get("message") or {}
            if not message.get("text") and not message.get("attachments"):
                continue
            sender = (msg.get("sender") or {}).get("id", "")
            ts = msg.get("timestamp")
            received = (
                datetime.fromtimestamp(ts / 1000, tz=timezone.utc)
                if ts else datetime.now(timezone.utc)
            )
            out.append(
                InboundMessage(
                    channel=channel,
                    clinic_id=page_id,  # resolved → uuid in agent_loop
                    platform_thread_id=sender,
                    platform_msg_id=message.get("mid", ""),
                    sender_handle=sender,
                    text=message.get("text", ""),
                    attachments=[
                        {"type": a.get("type", "unknown"),
                         "url": (a.get("payload") or {}).get("url")}
                        for a in (message.get("attachments") or [])
                    ],
                    received_at=received,
                )
            )
    return out
