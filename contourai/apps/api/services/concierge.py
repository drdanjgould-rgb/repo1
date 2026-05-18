"""ConciergeAgent — generates the patient-facing reply and emits structured
classifier output via a single tool-use call.

Prompt structure (cacheable):

    [system: concierge persona + output contract]   ← cached
    [system: clinic block (services, FAQ, tone)]    ← cached
    [system: patient block (state, score, profile)] ← not cached
    [messages: last 20 turns + new message]         ← not cached
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

from anthropic.types import MessageParam

from apps.api.config import get_settings
from apps.api.schemas.agent import ConciergeReply
from apps.api.services.llm import LLM, get_llm

_SYSTEM_PROMPT = (Path(__file__).resolve().parent.parent / "prompts" / "concierge_system.md").read_text()


SEND_REPLY_TOOL = {
    "name": "send_reply",
    "description": "Send a reply to the patient and record classifier output.",
    "input_schema": {
        "type": "object",
        "required": ["reply_text", "intent", "lead_score_delta", "next_action"],
        "properties": {
            "reply_text": {"type": "string"},
            "intent": {
                "type": "string",
                "enum": ["pricing", "booking", "education", "complaint",
                         "small_talk", "human_request", "opt_out", "other"],
            },
            "procedure": {"type": "string"},
            "lead_score_delta": {"type": "integer", "minimum": -20, "maximum": 40},
            "captured": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "email": {"type": "string"},
                    "phone": {"type": "string"},
                    "timeline": {"type": "string"},
                    "zip": {"type": "string"},
                },
            },
            "next_action": {
                "type": "string",
                "enum": ["send_pricing_resource", "send_booking_link",
                         "ask_followup", "nurture_drip", "wait", "handoff_human"],
            },
        },
    },
}


def render_clinic_block(clinic: dict[str, Any]) -> str:
    """Format the clinic-specific context. Stable across messages within a
    conversation -> cached."""
    lines = [
        f"# Clinic: {clinic['name']}",
        f"Booking link: {clinic.get('booking_url', '(unset)')}",
        f"Timezone: {clinic.get('timezone', 'America/Los_Angeles')}",
        "",
        "## Services & price ranges",
    ]
    for svc in clinic.get("services", []):
        lo, hi = svc.get("price_low"), svc.get("price_high")
        price = f" — typical investment ${lo:,}–${hi:,}" if lo and hi else ""
        lines.append(f"- {svc['name']}{price}")
    if faq := clinic.get("faq", "").strip():
        lines += ["", "## FAQ", faq]
    if overrides := clinic.get("tone_overrides", "").strip():
        lines += ["", "## Tone overrides", overrides]
    return "\n".join(lines)


def render_patient_block(patient: dict[str, Any]) -> str:
    parts = [
        "# Patient context",
        f"- Journey state: {patient.get('journey_state', 'new_lead')}",
        f"- Lead score: {patient.get('lead_score', 0)}",
        f"- Display name: {patient.get('display_name') or '(unknown)'}",
    ]
    if patient.get("phone"):
        parts.append(f"- Phone on file: {patient['phone']}")
    if patient.get("email"):
        parts.append(f"- Email on file: {patient['email']}")
    if profile := patient.get("profile") or {}:
        for k, v in profile.items():
            parts.append(f"- {k}: {v}")
    return "\n".join(parts)


async def run_concierge(
    *,
    clinic: dict[str, Any],
    patient: dict[str, Any],
    history: list[tuple[str, str]],  # (sender, text), oldest first
    new_message: str,
    llm: LLM | None = None,
) -> tuple[ConciergeReply, dict[str, Any]]:
    """Run a single concierge turn. Returns (reply, raw_llm_metadata)."""
    llm = llm or get_llm()
    settings = get_settings()

    system_blocks = [
        {"type": "text", "text": _SYSTEM_PROMPT,
         "cache_control": {"type": "ephemeral"}},
        {"type": "text", "text": render_clinic_block(clinic),
         "cache_control": {"type": "ephemeral"}},
        {"type": "text", "text": render_patient_block(patient)},
    ]

    messages: list[MessageParam] = []
    for sender, text in history[-20:]:
        role = "assistant" if sender in ("bot", "human") else "user"
        messages.append({"role": role, "content": text})
    messages.append({"role": "user", "content": new_message})

    result = await llm.tool_call(
        model=settings.llm_concierge_model,
        system=system_blocks,
        messages=messages,
        tools=[SEND_REPLY_TOOL],
        tool_choice={"type": "tool", "name": "send_reply"},
        max_tokens=1024,
    )
    return ConciergeReply.model_validate(result["input"]), result["usage"]
