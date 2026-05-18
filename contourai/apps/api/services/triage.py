"""TriageAgent — red-flag classifier. Runs before ConciergeAgent on every
inbound message. Regex pre-filter catches the easy 90% at zero LLM cost;
the LLM check catches phrasings the regex misses.
"""
from __future__ import annotations

import re

from apps.api.config import get_settings
from apps.api.schemas.agent import TriageVerdict
from apps.api.services.llm import LLM, get_llm

# Clinic-tunable in production; baseline list lives here.
_RED_FLAG_PATTERNS = [
    r"\bbleeding\b", r"\bhemorrhag", r"\bgushing\b",
    r"\bdizzy\b", r"\blightheaded\b", r"\bfaint(ed|ing)?\b", r"\bpassed out\b",
    r"\bchest pain\b", r"\bcan'?t breathe\b", r"\bshortness of breath\b",
    r"\bnumb\b", r"\bnumbness\b",
    r"\bsuicid(e|al)\b", r"\bkill myself\b", r"\bharm myself\b",
    r"\b911\b", r"\bemergency room\b", r"\bER\b",
    r"\bfever\b.*\b10[1-9]\b", r"\b10[1-9]\b.*\bfever\b",
    r"\bpus\b", r"\bdehiscence\b", r"\bopen wound\b",
    r"\binfection\b", r"\bsepsis\b",
]
_RED_FLAG_RE = re.compile("|".join(_RED_FLAG_PATTERNS), re.IGNORECASE)


TRIAGE_SYSTEM = """You are a medical safety classifier for an aesthetic-surgery
practice's patient-coordinator chatbot. You will be shown one patient message
at a time. Your job: decide whether the message warrants immediate human
escalation.

Escalate (red_flag=true) if the patient describes any of:
- Post-operative symptoms that could indicate a complication (bleeding, severe
  pain, fever > 101F, signs of infection, dehiscence, numbness lasting > expected,
  asymmetric swelling, sudden visual changes after eyelid/facial surgery).
- Acute medical emergency (chest pain, can't breathe, fainting, stroke
  symptoms, severe allergic reaction).
- Mental-health crisis (suicidal ideation, self-harm).

Do NOT escalate when:
- The patient is hypothetically asking ("what if I bled?") with no current symptom.
- The patient is quoting someone else.
- The mention is a general question about recovery (normal swelling, normal
  bruising, normal post-op timeline) with no urgency signal.
- The patient asks about pricing, scheduling, or general procedure information.

Always call the `triage` tool. Be conservative: when in doubt, escalate.
"""

TRIAGE_TOOL = {
    "name": "triage",
    "description": "Record the safety verdict for the patient message.",
    "input_schema": {
        "type": "object",
        "required": ["red_flag", "category", "severity", "rationale"],
        "properties": {
            "red_flag": {"type": "boolean"},
            "category": {
                "type": "string",
                "enum": ["medical_emergency", "post_op_complication",
                         "mental_health", "none"],
            },
            "severity": {"type": "integer", "minimum": 1, "maximum": 5},
            "rationale": {"type": "string"},
        },
    },
}


def regex_prefilter(text: str) -> bool:
    """Returns True if a known red-flag pattern matches."""
    return bool(_RED_FLAG_RE.search(text or ""))


async def triage_message(
    text: str,
    *,
    journey_state: str,
    llm: LLM | None = None,
) -> TriageVerdict:
    """Run the two-pass triage. Patients in post-op states get a lower
    threshold (we send the LLM check even without a regex hit)."""
    llm = llm or get_llm()
    settings = get_settings()

    regex_hit = regex_prefilter(text)
    post_op = journey_state in {"pre_op", "post_op_d0_d14"}

    if not regex_hit and not post_op:
        return TriageVerdict(red_flag=False, category="none", severity=1,
                             rationale="no regex match; not post-op")

    result = await llm.tool_call(
        model=settings.llm_triage_model,
        system=[{"type": "text", "text": TRIAGE_SYSTEM,
                 "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": text}],
        tools=[TRIAGE_TOOL],
        tool_choice={"type": "tool", "name": "triage"},
        max_tokens=400,
    )
    return TriageVerdict.model_validate(result["input"])
