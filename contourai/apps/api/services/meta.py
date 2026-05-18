"""Meta Graph API outbound sender + webhook signature verification."""
from __future__ import annotations

import hashlib
import hmac

import httpx
import structlog

from apps.api.config import get_settings

log = structlog.get_logger(__name__)


def verify_signature(*, body: bytes, signature_header: str | None) -> bool:
    """Validate the X-Hub-Signature-256 header sent by Meta."""
    if not signature_header:
        return False
    settings = get_settings()
    if not settings.meta_app_secret:
        log.error("meta.signature.missing_secret")
        return False
    if not signature_header.startswith("sha256="):
        return False
    expected = hmac.new(
        settings.meta_app_secret.encode(), body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature_header.removeprefix("sha256="))


async def send_message(*, page_id: str, recipient_psid: str, text: str) -> bool:
    """Send a DM via Graph API. Returns True on success."""
    settings = get_settings()
    if not settings.meta_page_access_token:
        log.error("meta.send.missing_token")
        return False

    url = (
        f"https://graph.facebook.com/{settings.meta_graph_api_version}"
        f"/{page_id}/messages"
    )
    async with httpx.AsyncClient(timeout=10.0) as http:
        try:
            resp = await http.post(
                url,
                params={"access_token": settings.meta_page_access_token},
                json={
                    "recipient": {"id": recipient_psid},
                    "messaging_type": "RESPONSE",
                    "message": {"text": text},
                },
            )
            resp.raise_for_status()
            return True
        except httpx.HTTPError as exc:
            log.warning("meta.send.failed", error=str(exc),
                        recipient=recipient_psid)
            return False
