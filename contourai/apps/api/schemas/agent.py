from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Intent = Literal[
    "pricing", "booking", "education", "complaint",
    "small_talk", "human_request", "opt_out", "other",
]

NextAction = Literal[
    "send_pricing_resource", "send_booking_link", "ask_followup",
    "nurture_drip", "wait", "handoff_human",
]


class CapturedContact(BaseModel):
    name: str | None = None
    email: str | None = None
    phone: str | None = None
    timeline: str | None = None
    zip: str | None = None


class ConciergeReply(BaseModel):
    """What the ConciergeAgent emits via tool use."""

    reply_text: str
    intent: Intent
    procedure: str | None = None
    lead_score_delta: int = Field(ge=-20, le=40, default=0)
    captured: CapturedContact = Field(default_factory=CapturedContact)
    next_action: NextAction = "ask_followup"


class TriageVerdict(BaseModel):
    red_flag: bool
    category: Literal["medical_emergency", "post_op_complication", "mental_health", "none"]
    severity: int = Field(ge=1, le=5, default=1)
    rationale: str = ""
