"""
Tests for _run_differential_llm — asking the model for a structured
differential-diagnosis read and surviving the times it doesn't comply.

Same fail-safe philosophy as test_acuity_parsing.py: when the model returns
something unparseable, the function must fail toward visibility (the raw text
surfaced as the summary) rather than toward silence (an empty differentials
list that looks like "the AI found nothing").
"""

import json

from rag.pipeline import _run_differential_llm


def test_clean_json_is_parsed(fake_llm):
    fake_llm(
        json.dumps(
            {
                "summary": "Presentation is consistent with a few common causes of fever.",
                "differentials": [
                    {"condition": "Malaria", "confidence": "HIGH", "reasoning": "Fever with chills in an endemic area."},
                    {"condition": "Typhoid fever", "confidence": "MODERATE", "reasoning": "Sustained fever and headache."},
                ],
            }
        )
    )
    summary, differentials = _run_differential_llm("any prompt")
    assert summary == "Presentation is consistent with a few common causes of fever."
    assert differentials == [
        {"condition": "Malaria", "confidence": "HIGH", "reasoning": "Fever with chills in an endemic area."},
        {"condition": "Typhoid fever", "confidence": "MODERATE", "reasoning": "Sustained fever and headache."},
    ]


def test_confidence_is_case_insensitive(fake_llm):
    fake_llm(
        json.dumps(
            {
                "summary": "...",
                "differentials": [{"condition": "Malaria", "confidence": "high", "reasoning": "..."}],
            }
        )
    )
    _summary, differentials = _run_differential_llm("any prompt")
    assert differentials[0]["confidence"] == "HIGH"


def test_markdown_fenced_json_is_unwrapped(fake_llm):
    payload = json.dumps({"summary": "Routine.", "differentials": []})
    fake_llm(f"```json\n{payload}\n```")
    summary, differentials = _run_differential_llm("any prompt")
    assert (summary, differentials) == ("Routine.", [])


def test_malformed_json_fails_toward_a_visible_summary_not_a_silent_empty_list(fake_llm):
    """The fail-safe. An unparseable answer must be clearly flagged, not read
    as a confident 'no differentials found'."""
    fake_llm("I'm sorry, I can't produce JSON for that.")
    summary, differentials = _run_differential_llm("any prompt")
    assert "failed to parse" in summary
    assert "I'm sorry, I can't produce JSON for that." in summary
    assert differentials == []


def test_missing_summary_key_falls_back(fake_llm):
    fake_llm(json.dumps({"differentials": []}))
    summary, differentials = _run_differential_llm("any prompt")
    assert "failed to parse" in summary
    assert differentials == []


def test_differentials_are_capped_at_five(fake_llm):
    fake_llm(
        json.dumps(
            {
                "summary": "...",
                "differentials": [
                    {"condition": f"Condition {i}", "confidence": "LOW", "reasoning": "..."} for i in range(8)
                ],
            }
        )
    )
    _summary, differentials = _run_differential_llm("any prompt")
    assert len(differentials) == 5


def test_entries_with_an_invalid_confidence_are_dropped(fake_llm):
    fake_llm(
        json.dumps(
            {
                "summary": "...",
                "differentials": [
                    {"condition": "Malaria", "confidence": "HIGH", "reasoning": "..."},
                    {"condition": "Unlikely thing", "confidence": "MAYBE", "reasoning": "..."},
                ],
            }
        )
    )
    _summary, differentials = _run_differential_llm("any prompt")
    assert [d["condition"] for d in differentials] == ["Malaria"]


def test_non_dict_and_non_string_entries_are_dropped(fake_llm):
    """A model that returns a bare string or a malformed object in the list
    shouldn't crash the render — those entries are filtered, not coerced."""
    fake_llm(
        json.dumps(
            {
                "summary": "...",
                "differentials": [
                    "just a string",
                    {"condition": "Malaria", "confidence": "HIGH", "reasoning": "..."},
                    {"condition": 42, "confidence": "HIGH", "reasoning": "..."},
                ],
            }
        )
    )
    _summary, differentials = _run_differential_llm("any prompt")
    assert [d["condition"] for d in differentials] == ["Malaria"]


def test_the_system_and_user_messages_are_both_sent(fake_llm):
    llm = fake_llm(json.dumps({"summary": "ok", "differentials": []}))
    _run_differential_llm("the user prompt")
    roles = [m["role"] for m in llm.calls[0]]
    assert roles == ["system", "user"]
    assert llm.calls[0][1]["content"] == "the user prompt"
