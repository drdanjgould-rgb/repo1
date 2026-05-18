"""Deterministic lead scoring. LLM emits a suggestion; this module decides.

Weights are clinic-tunable via ``clinics.lead_scoring_weights`` (JSONB). The
defaults below match the spec in docs/patient-journey.md.
"""
from __future__ import annotations

from typing import Any

from apps.api.schemas.agent import ConciergeReply

DEFAULT_WEIGHTS: dict[str, int] = {
    "asked_to_book": 40,
    "asked_price": 20,
    "named_procedure": 15,
    "provided_phone": 15,
    "provided_email": 10,
    "local_zip": 10,
    "mentioned_timeline": 10,
    "repeat_engagement": 10,
    "reacted_to_post": 5,
    "vague_reply": -10,
    "comparing_surgeons": 5,
}

LLM_DELTA_CAP = 10


def _weights(clinic: dict[str, Any]) -> dict[str, int]:
    return {**DEFAULT_WEIGHTS, **(clinic.get("lead_scoring_weights") or {})}


def score_lead(
    *,
    clinic: dict[str, Any],
    patient: dict[str, Any],
    current_score: int,
    reply: ConciergeReply,
    repeat_engagement: bool,
    local_zip: bool,
) -> int:
    """Compute the new lead score from hard signals + capped LLM delta."""
    w = _weights(clinic)

    delta = 0
    if reply.intent == "booking":
        delta += w["asked_to_book"]
    if reply.intent == "pricing":
        delta += w["asked_price"]
    if reply.procedure:
        delta += w["named_procedure"]
    if reply.captured.phone and not patient.get("phone"):
        delta += w["provided_phone"]
    if reply.captured.email and not patient.get("email"):
        delta += w["provided_email"]
    if reply.captured.timeline:
        delta += w["mentioned_timeline"]
    if reply.captured.zip and local_zip:
        delta += w["local_zip"]
    if repeat_engagement:
        delta += w["repeat_engagement"]
    if reply.intent in ("opt_out", "complaint"):
        delta -= 20

    delta += max(-LLM_DELTA_CAP, min(LLM_DELTA_CAP, reply.lead_score_delta))

    new_score = max(0, min(100, current_score + delta))
    return new_score
