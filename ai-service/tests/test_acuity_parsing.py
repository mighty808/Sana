"""
Tests for _run_acuity_llm — asking the model for a structured triage read and
surviving the times it doesn't comply.

The behaviour under test is a safety property, not a parsing convenience. When
the model returns something unparseable, the function must fail toward
attention (URGENT) rather than toward silence (STABLE): a nurse seeing "STABLE"
because the JSON was malformed is strictly worse than seeing nothing.
"""

import json

from rag.pipeline import _run_acuity_llm

STABLE, URGENT, CRITICAL = 0, 1, 2


def test_clean_json_is_parsed(fake_llm):
    fake_llm(
        json.dumps(
            {
                "acuityLevel": "CRITICAL",
                "reasons": ["hypoxia", "tachycardia"],
                "guidance": "Escalate immediately and start oxygen.",
            }
        )
    )
    level, reasons, guidance = _run_acuity_llm("any prompt")
    assert level == CRITICAL
    assert reasons == ["hypoxia", "tachycardia"]
    assert guidance == "Escalate immediately and start oxygen."


def test_level_is_case_insensitive(fake_llm):
    """The prompt asks for upper case, but a model that returns 'Urgent'
    shouldn't tip the whole response into the fallback path."""
    fake_llm(json.dumps({"acuityLevel": "urgent", "reasons": [], "guidance": "Monitor."}))
    level, _reasons, _guidance = _run_acuity_llm("any prompt")
    assert level == URGENT


def test_markdown_fenced_json_is_unwrapped(fake_llm):
    """ACUITY_SYSTEM_PROMPT forbids code fences, but models add them anyway —
    a wrapped-but-otherwise-perfect answer shouldn't be thrown away."""
    payload = json.dumps({"acuityLevel": "STABLE", "reasons": [], "guidance": "Routine care."})
    fake_llm(f"```json\n{payload}\n```")
    level, reasons, guidance = _run_acuity_llm("any prompt")
    assert (level, reasons, guidance) == (STABLE, [], "Routine care.")


def test_bare_fence_without_a_language_tag_is_unwrapped(fake_llm):
    payload = json.dumps({"acuityLevel": "STABLE", "reasons": [], "guidance": "Routine care."})
    fake_llm(f"```\n{payload}\n```")
    level, _reasons, _guidance = _run_acuity_llm("any prompt")
    assert level == STABLE


def test_backticks_inside_the_guidance_text_survive(fake_llm):
    """
    _JSON_FENCE_RE deliberately omits re.MULTILINE so ^ and $ anchor to the
    whole string. With MULTILINE, a line *inside* the guidance that began with
    backticks would be stripped too, corrupting valid JSON into a parse
    failure — and that failure would silently become a fallback URGENT.
    """
    payload = json.dumps(
        {
            "acuityLevel": "STABLE",
            "reasons": [],
            "guidance": "Check the chart.\n```not a fence```\nThen reassess.",
        }
    )
    fake_llm(payload)
    level, _reasons, guidance = _run_acuity_llm("any prompt")
    assert level == STABLE
    assert "not a fence" in guidance


def test_malformed_json_falls_back_to_urgent(fake_llm):
    """The fail-safe. An unparseable answer must never read as STABLE."""
    fake_llm("I'm sorry, I can't produce JSON for that.")
    level, reasons, guidance = _run_acuity_llm("any prompt")
    assert level == URGENT
    # The raw text is handed back as the guidance so the nurse still sees
    # whatever the model did say, rather than an empty panel.
    assert guidance == "I'm sorry, I can't produce JSON for that."
    assert len(reasons) == 1
    assert "failed to parse" in reasons[0]


def test_unrecognised_acuity_level_falls_back_to_urgent(fake_llm):
    """Valid JSON, invalid level — the KeyError on ACUITY_LEVELS must take the
    same fail-safe path as a syntax error."""
    fake_llm(json.dumps({"acuityLevel": "MODERATE", "reasons": [], "guidance": "..."}))
    level, _reasons, _guidance = _run_acuity_llm("any prompt")
    assert level == URGENT


def test_missing_guidance_key_falls_back_to_urgent(fake_llm):
    fake_llm(json.dumps({"acuityLevel": "STABLE", "reasons": []}))
    level, _reasons, _guidance = _run_acuity_llm("any prompt")
    assert level == URGENT


def test_reasons_are_capped_at_three(fake_llm):
    """The prompt asks for at most 3; the code enforces it rather than trusting
    the model, because these render in a fixed-height panel."""
    fake_llm(
        json.dumps(
            {
                "acuityLevel": "URGENT",
                "reasons": ["one", "two", "three", "four", "five"],
                "guidance": "...",
            }
        )
    )
    _level, reasons, _guidance = _run_acuity_llm("any prompt")
    assert reasons == ["one", "two", "three"]


def test_non_string_reasons_are_dropped(fake_llm):
    """A model that returns a nested object in the reasons list shouldn't crash
    the render — those entries are filtered, not coerced."""
    fake_llm(
        json.dumps(
            {
                "acuityLevel": "URGENT",
                "reasons": ["hypoxia", {"nested": "object"}, 42, "tachycardia"],
                "guidance": "...",
            }
        )
    )
    _level, reasons, _guidance = _run_acuity_llm("any prompt")
    assert reasons == ["hypoxia", "tachycardia"]


def test_the_system_and_user_messages_are_both_sent(fake_llm):
    llm = fake_llm(json.dumps({"acuityLevel": "STABLE", "reasons": [], "guidance": "ok"}))
    _run_acuity_llm("the user prompt")
    roles = [m["role"] for m in llm.calls[0]]
    assert roles == ["system", "user"]
    assert llm.calls[0][1]["content"] == "the user prompt"
