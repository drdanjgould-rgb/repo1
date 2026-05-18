from apps.api.schemas.agent import CapturedContact, ConciergeReply, TriageVerdict
from apps.api.services.state_machine import advance


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


def _safe_verdict() -> TriageVerdict:
    return TriageVerdict(red_flag=False, category="none", severity=1, rationale="")


def test_red_flag_short_circuits_to_escalated() -> None:
    t = advance(
        current_state="nurturing",
        triage=TriageVerdict(red_flag=True, category="medical_emergency",
                             severity=5, rationale="bleeding"),
        reply=_reply(),
        new_lead_score=50,
        patient={},
    )
    assert t is not None and t.next_state == "escalated"


def test_opt_out_routes_to_closed_lost() -> None:
    t = advance(
        current_state="qualifying",
        triage=_safe_verdict(),
        reply=_reply(intent="opt_out"),
        new_lead_score=0,
        patient={},
    )
    assert t is not None and t.next_state == "closed_lost"


def test_new_lead_with_name_advances_to_qualifying() -> None:
    t = advance(
        current_state="new_lead",
        triage=_safe_verdict(),
        reply=_reply(captured=CapturedContact(name="Sarah")),
        new_lead_score=15,
        patient={},
    )
    assert t is not None and t.next_state == "qualifying"


def test_qualifying_with_contact_and_hot_score_goes_to_nurturing() -> None:
    t = advance(
        current_state="qualifying",
        triage=_safe_verdict(),
        reply=_reply(intent="booking",
                     captured=CapturedContact(phone="+15551234")),
        new_lead_score=75,
        patient={},
    )
    assert t is not None and t.next_state == "nurturing"


def test_human_request_escalates() -> None:
    t = advance(
        current_state="nurturing",
        triage=_safe_verdict(),
        reply=_reply(intent="human_request"),
        new_lead_score=40,
        patient={},
    )
    assert t is not None and t.next_state == "escalated"
