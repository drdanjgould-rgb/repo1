"""Regex pre-filter unit tests. The LLM half is exercised in eval suites,
not unit tests."""
import pytest

from apps.api.services.triage import regex_prefilter


@pytest.mark.parametrize("text", [
    "I think I'm bleeding through the dressing",
    "I feel dizzy and lightheaded",
    "I have chest pain since yesterday",
    "i passed out this morning",
    "infection at the incision site",
    "I want to kill myself",
    "Should I go to the ER?",
    "my fever is 102",
])
def test_red_flag_hits(text: str) -> None:
    assert regex_prefilter(text) is True


@pytest.mark.parametrize("text", [
    "how much does this cost?",
    "can i book a consult next week",
    "what's the recovery time normally",
    "im so excited for my consult",
    "is normal swelling expected day 3",
])
def test_non_red_flag(text: str) -> None:
    assert regex_prefilter(text) is False
