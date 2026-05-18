"""GoHighLevel one-way sync. Postgres is canonical; GHL is the Phase-1 UI.

The interface intentionally swallows non-fatal errors — sync is fire-and-
forget, the patient experience must not depend on GHL availability.
"""
from __future__ import annotations

from typing import Any

import httpx
import structlog

from apps.api.config import get_settings

log = structlog.get_logger(__name__)


class GHLClient:
    def __init__(self, location_id: str, access_token: str, base_url: str | None = None) -> None:
        self.location_id = location_id
        self.access_token = access_token
        self.base_url = (base_url or get_settings().ghl_base_url).rstrip("/")
        self._http = httpx.AsyncClient(
            timeout=10.0,
            headers={
                "Authorization": f"Bearer {self.access_token}",
                "Content-Type": "application/json",
                "Version": "2021-07-28",
            },
        )

    async def upsert_contact(
        self,
        *,
        email: str | None,
        phone: str | None,
        first_name: str | None,
        last_name: str | None,
        tags: list[str],
        custom_fields: dict[str, Any],
    ) -> str | None:
        """Upsert a contact in GHL. Returns the GHL contact id on success."""
        body = {
            "locationId": self.location_id,
            "email": email,
            "phone": phone,
            "firstName": first_name,
            "lastName": last_name,
            "tags": tags,
            "customFields": [{"key": k, "field_value": v} for k, v in custom_fields.items()],
        }
        try:
            resp = await self._http.post(f"{self.base_url}/contacts/upsert", json=body)
            resp.raise_for_status()
            return resp.json().get("contact", {}).get("id")
        except httpx.HTTPError as exc:
            log.warning("ghl.upsert_failed", error=str(exc))
            return None

    async def add_note(self, *, contact_id: str, body: str) -> None:
        try:
            resp = await self._http.post(
                f"{self.base_url}/contacts/{contact_id}/notes",
                json={"body": body},
            )
            resp.raise_for_status()
        except httpx.HTTPError as exc:
            log.warning("ghl.note_failed", error=str(exc), contact_id=contact_id)

    async def aclose(self) -> None:
        await self._http.aclose()


def state_tag(journey_state: str) -> str:
    return f"contourai:state_{journey_state}"


def score_tag(score: int) -> str:
    if score >= 70:
        return "contourai:hot_lead"
    if score >= 40:
        return "contourai:warm_lead"
    return "contourai:cold_lead"
