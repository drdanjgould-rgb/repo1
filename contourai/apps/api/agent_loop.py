"""End-to-end inbound-message handler. Channel webhook → safety → reply →
send → sync.

This is the orchestration spine; each step delegates to a dedicated service
so individual pieces stay testable. See docs/ai-concierge.md for the design.
"""
from __future__ import annotations

import structlog

from apps.api.schemas.inbound import InboundMessage
from apps.api.services import concierge, lead_scoring, state_machine, triage
from apps.api.services.meta import send_message

log = structlog.get_logger(__name__)


async def handle_inbound(inbound: InboundMessage) -> None:
    """Process one inbound message end-to-end.

    Phase 1 ships this as a single in-process function. Phase 2 will move
    the body into a worker job (Celery/RQ/Arq) keyed on platform_msg_id.
    """
    log.info("agent.inbound",
             channel=inbound.channel,
             handle=inbound.sender_handle,
             msg_id=inbound.platform_msg_id)

    # The DB-bound implementations of these steps live in `agent_loop_db.py`
    # (to be added in the first DB-wired iteration). Below is the pure
    # orchestration so the contract is clear.
    clinic = await _resolve_clinic(inbound.clinic_id)
    if clinic is None:
        log.error("agent.unknown_clinic", page_id=inbound.clinic_id)
        return

    patient = await _resolve_patient(clinic, inbound)
    history = await _conversation_history(clinic, patient)

    verdict = await triage.triage_message(
        inbound.text, journey_state=patient["journey_state"]
    )
    if verdict.red_flag:
        await _escalate(clinic, patient, inbound, verdict)
        await send_message(
            page_id=clinic["meta_page_id"],
            recipient_psid=inbound.sender_handle,
            text=(
                "Thanks for reaching out — a member of our team will respond "
                "shortly. If this is a medical emergency, please call 911 or "
                "go to the nearest emergency room."
            ),
        )
        return

    reply, usage = await concierge.run_concierge(
        clinic=clinic,
        patient=patient,
        history=history,
        new_message=inbound.text,
    )

    new_score = lead_scoring.score_lead(
        clinic=clinic,
        patient=patient,
        current_score=patient.get("lead_score", 0),
        reply=reply,
        repeat_engagement=len(history) >= 3,
        local_zip=_is_local(clinic, reply.captured.zip),
    )

    transition = state_machine.advance(
        current_state=patient["journey_state"],
        triage=verdict,
        reply=reply,
        new_lead_score=new_score,
        patient=patient,
    )

    await _persist_outcome(
        clinic=clinic, patient=patient, inbound=inbound,
        reply=reply, score=new_score, transition=transition, usage=usage,
    )

    await send_message(
        page_id=clinic["meta_page_id"],
        recipient_psid=inbound.sender_handle,
        text=reply.reply_text,
    )

    await _sync_ghl(clinic, patient, reply, new_score, transition)


def _is_local(clinic: dict, zip_: str | None) -> bool:
    if not zip_:
        return False
    return zip_ in (clinic.get("service_area_zips") or [])


# ---------------------------------------------------------------------------
# DB stubs — wired up in the first integration pass. Kept here so this file
# documents the orchestration shape end-to-end without dragging session
# plumbing into every test.
# ---------------------------------------------------------------------------

async def _resolve_clinic(meta_page_id: str) -> dict | None:
    raise NotImplementedError("wire to db.session_scope in apps/api/repo/clinics.py")


async def _resolve_patient(clinic: dict, inbound: InboundMessage) -> dict:
    raise NotImplementedError("wire to db.session_scope in apps/api/repo/patients.py")


async def _conversation_history(clinic: dict, patient: dict) -> list[tuple[str, str]]:
    raise NotImplementedError("wire to db.session_scope in apps/api/repo/messages.py")


async def _escalate(clinic: dict, patient: dict, inbound, verdict) -> None:
    raise NotImplementedError("wire to db.session_scope + clinic notification")


async def _persist_outcome(**kwargs) -> None:
    raise NotImplementedError("wire to db.session_scope (messages, leads, events)")


async def _sync_ghl(clinic, patient, reply, score, transition) -> None:
    raise NotImplementedError("wire to services.ghl.GHLClient")
