from apps.api.schemas.agent import CapturedContact, ConciergeReply
from apps.api.services.lead_scoring import score_lead


def _reply(**overrides) -> ConciergeReply:
    base = {
        "reply_text": "Hi!",
        "intent": "other",
        "lead_score_delta": 0,
        "next_action": "ask_followup",
        "captured": CapturedContact(),
    }
    base.update(overrides)
    return ConciergeReply.model_validate(base)


def test_booking_intent_boosts_score() -> None:
    new = score_lead(
        clinic={},
        patient={},
        current_score=10,
        reply=_reply(intent="booking"),
        repeat_engagement=False,
        local_zip=False,
    )
    assert new == 50  # 10 + 40 for booking


def test_phone_capture_adds_only_when_new() -> None:
    reply = _reply(captured=CapturedContact(phone="+15551234"))
    new = score_lead(
        clinic={},
        patient={"phone": "+15559999"},
        current_score=0,
        reply=reply,
        repeat_engagement=False,
        local_zip=False,
    )
    assert new == 0  # phone already on file, no bump


def test_llm_delta_is_capped() -> None:
    reply = _reply(lead_score_delta=40)
    new = score_lead(
        clinic={},
        patient={},
        current_score=0,
        reply=reply,
        repeat_engagement=False,
        local_zip=False,
    )
    # 40 is the LLM's suggestion but cap is ±10
    assert new == 10


def test_score_clamped_to_100() -> None:
    new = score_lead(
        clinic={},
        patient={},
        current_score=90,
        reply=_reply(intent="booking", lead_score_delta=10),
        repeat_engagement=True,
        local_zip=False,
    )
    assert new == 100
