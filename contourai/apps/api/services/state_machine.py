"""Patient journey state machine. Deterministic — the LLM never picks the
next state.

See docs/patient-journey.md for the full transition table.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from apps.api.schemas.agent import ConciergeReply, TriageVerdict


@dataclass
class Transition:
    next_state: str
    reason: str


STATES = {
    "new_lead", "qualifying", "nurturing", "consult_scheduled",
    "consult_complete", "pre_op", "post_op_d0_d14", "recovery_complete",
    "review_solicit", "reactivation", "escalated", "closed_lost",
}


def advance(
    *,
    current_state: str,
    triage: TriageVerdict,
    reply: ConciergeReply,
    new_lead_score: int,
    patient: dict[str, Any],
) -> Transition | None:
    """Return the next state, or None if no transition. Pure function."""
    if triage.red_flag:
        return Transition("escalated", f"red_flag:{triage.category}")
    if reply.intent == "human_request":
        return Transition("escalated", "human_handoff_request")
    if reply.intent == "opt_out":
        return Transition("closed_lost", "opt_out")

    # The state machine deals only with transitions a single inbound message
    # can cause. Time-based transitions (`inactive_90d`, `recovery_d14`, ...)
    # belong to the daily cron, not here.
    if current_state == "new_lead":
        if reply.captured.name or reply.captured.phone or reply.captured.email:
            return Transition("qualifying", "info_captured")
        return Transition("qualifying", "first_response")

    if current_state == "qualifying":
        captured_ok = bool(
            (reply.captured.phone or patient.get("phone"))
            or (reply.captured.email or patient.get("email"))
        )
        if captured_ok and new_lead_score >= 70:
            return Transition("nurturing", "hot_lead")
        if captured_ok:
            return Transition("nurturing", "info_complete")

    if current_state == "nurturing" and reply.next_action == "send_booking_link":
        return None  # state advances on booking_confirmed webhook, not here

    return None
