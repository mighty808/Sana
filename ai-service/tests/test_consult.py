"""
Tests for consult() — the orchestration that ties retrieval, the relevance
threshold, the prompt, and the two acuity reads together.

Both the vector store and the LLM are faked (see tests/conftest.py), so these
run offline and deterministically. What's being tested is the wiring and the
decisions, not the quality of any model output — retrieval quality is measured
separately in tests/test_retrieval.py.
"""

import json

from rag.pipeline import MIN_RELEVANCE_SCORE, consult

# Scores chosen to sit either side of MIN_RELEVANCE_SCORE without depending on
# its exact value, so tuning the threshold doesn't invalidate these tests.
ABOVE = MIN_RELEVANCE_SCORE + 0.2
BELOW = MIN_RELEVANCE_SCORE - 0.2


def test_only_passages_above_the_threshold_reach_the_prompt(fake_store, fake_llm):
    """
    The core retrieval decision. A weak match is worse than no match: the model
    will synthesize an answer from whatever it's handed, so a barely-related
    passage produces a confident answer grounded in nothing.
    """
    fake_store(
        [
            ("Malaria is treated with artemisinin combination therapy.", "Ghana STG — Malaria", ABOVE),
            ("Sickle cell crises need analgesia and hydration.", "Ghana STG — Sickle Cell", BELOW),
        ]
    )
    llm = fake_llm()

    consult("How is malaria treated?", {})

    prompt = llm.last_user_prompt
    assert "artemisinin" in prompt
    assert "Sickle cell crises" not in prompt


def test_below_threshold_passages_are_still_returned_as_sources(fake_store, fake_llm):
    """
    Excluded from the prompt, but not hidden from the caller — the UI can still
    show a loosely-related hit with its real score. The `grounded` flag is what
    tells the two apart downstream.
    """
    fake_store(
        [
            ("Relevant text.", "Ghana STG — Malaria", ABOVE),
            ("Unrelated text.", "Ghana STG — Burns", BELOW),
        ]
    )
    fake_llm()

    result = consult("How is malaria treated?", {})

    assert [s["title"] for s in result["sources"]] == ["Ghana STG — Malaria", "Ghana STG — Burns"]
    assert result["ragMetadata"]["retrievalCount"] == 2


def test_no_relevant_passages_tells_the_model_so_explicitly(fake_store, fake_llm):
    """
    With everything filtered out the context block is empty. The prompt must
    say that in words rather than leave a blank section, because a blank one
    reads as "no material was retrieved for you" — which the model answers from
    its own parametric memory, exactly what RAG is here to prevent.
    """
    fake_store([("Unrelated.", "Ghana STG — Burns", BELOW)])
    llm = fake_llm()

    consult("What is the best pizza topping?", {})

    assert "no passages in the knowledge base are strongly relevant" in llm.last_user_prompt


def test_patient_context_is_included_in_the_prompt(fake_store, fake_llm):
    fake_store([("Fever workup guidance.", "Ghana STG — Malaria", ABOVE)])
    llm = fake_llm()

    consult("What should I consider?", {"chiefComplaint": "Fever", "vitals": {"temperature": 39.2}})

    prompt = llm.last_user_prompt
    assert "Chief complaint: Fever" in prompt
    assert "temperature=39.2" in prompt


def test_response_has_every_field_the_express_contract_expects(fake_store, fake_llm):
    """
    consult() returns a plain dict that FastAPI validates against
    ConsultResponse. Asserting the keys here catches a drift at the point it's
    introduced, rather than as a validation error at request time.
    """
    fake_store([("Text.", "Ghana STG — Malaria", ABOVE)])
    fake_llm("Guidance text.")

    result = consult("A question", {})

    assert set(result) == {
        "diagnosticGuidance",
        "sources",
        "disclaimer",
        "ragMetadata",
        "acuityLevel",
        "acuityReasons",
    }
    assert result["diagnosticGuidance"] == "Guidance text."
    assert set(result["sources"][0]) == {"title", "excerpt", "score", "grounded"}
    assert set(result["ragMetadata"]) == {"model", "retrievalCount", "responseTimeMs"}
    assert result["disclaimer"]


def test_sources_are_labelled_with_whether_the_model_actually_saw_them(fake_store, fake_llm):
    """
    The provenance guarantee. Both passages are returned, but only the one
    above the threshold reached the prompt — and the response has to say which
    was which, or the UI renders a passage the model never read as the source
    of its answer.
    """
    fake_store(
        [
            ("Malaria text.", "Ghana STG — Malaria", ABOVE),
            ("Burns text.", "Ghana STG — Burns", BELOW),
        ]
    )
    llm = fake_llm()

    sources = consult("How is malaria treated?", {})["sources"]

    assert [(s["title"], s["grounded"]) for s in sources] == [
        ("Ghana STG — Malaria", True),
        ("Ghana STG — Burns", False),
    ]
    # The flag has to agree with what was really sent, not just with the
    # score — asserting both is what makes this a provenance test rather
    # than a restatement of the filter.
    prompt = llm.last_user_prompt
    assert "Malaria text." in prompt
    assert "Burns text." not in prompt


def test_every_source_is_ungrounded_when_nothing_clears_the_threshold(fake_store, fake_llm):
    fake_store([("Unrelated.", "Ghana STG — Burns", BELOW)])
    fake_llm()

    sources = consult("What is the best pizza topping?", {})["sources"]

    assert all(s["grounded"] is False for s in sources)


def test_source_excerpts_are_truncated(fake_store, fake_llm):
    """Excerpts render as chips in the UI, so they are capped at 280 chars —
    the full passage still went to the model."""
    fake_store([("x" * 500, "Ghana STG — Malaria", ABOVE)])
    fake_llm()

    result = consult("A question", {})

    assert len(result["sources"][0]["excerpt"]) == 280


def test_a_plain_consult_carries_no_acuity(fake_store, fake_llm):
    """Only the nurse's vitals analysis asks for a triage read. Everything else
    must leave these null so Express does not store a spurious acuity."""
    fake_store([("Text.", "Ghana STG — Malaria", ABOVE)])
    fake_llm()

    result = consult("A question", {}, assess_acuity=False)

    assert result["acuityLevel"] is None
    assert result["acuityReasons"] is None


def _acuity_json(level: str, reasons: list[str], guidance: str = "Guidance.") -> str:
    return json.dumps({"acuityLevel": level, "reasons": reasons, "guidance": guidance})


def test_dangerous_vitals_override_a_milder_llm_read(fake_store, fake_llm):
    """
    The single most important behaviour in the acuity path. The deterministic
    vitals check exists as a floor under the model: if the LLM says STABLE
    while the oxygen saturation is 85%, the patient is still CRITICAL.
    """
    fake_store([("Text.", "Ghana STG — Malaria", ABOVE)])
    fake_llm(_acuity_json("STABLE", []))

    result = consult("Assess this patient", {"vitals": {"oxygenSaturation": 85}}, assess_acuity=True)

    assert result["acuityLevel"] == "CRITICAL"
    assert any("85" in reason for reason in result["acuityReasons"])


def test_a_worse_llm_read_overrides_normal_vitals(fake_store, fake_llm):
    """The override runs both ways — the model can see danger in the complaint
    that the numeric thresholds have no way to catch."""
    fake_store([("Text.", "Ghana STG — Malaria", ABOVE)])
    fake_llm(_acuity_json("CRITICAL", ["stiff neck with photophobia"]))

    result = consult(
        "Assess this patient",
        {"chiefComplaint": "Severe headache and neck stiffness", "vitals": {"temperature": 37.0}},
        assess_acuity=True,
    )

    assert result["acuityLevel"] == "CRITICAL"
    assert "stiff neck with photophobia" in result["acuityReasons"]


def test_acuity_guidance_comes_from_the_structured_response(fake_store, fake_llm):
    fake_store([("Text.", "Ghana STG — Malaria", ABOVE)])
    fake_llm(_acuity_json("URGENT", ["fever"], guidance="Watch for rising temperature."))

    result = consult("Assess", {"vitals": {"temperature": 38.8}}, assess_acuity=True)

    assert result["diagnosticGuidance"] == "Watch for rising temperature."


def test_duplicate_reasons_are_deduped_in_order(fake_store, fake_llm):
    """The vitals check and the model can name the same finding. Showing it
    twice makes the panel look broken."""
    fake_store([("Text.", "Ghana STG — Malaria", ABOVE)])
    duplicate = "Oxygen saturation 88% is critically low"
    fake_llm(_acuity_json("URGENT", [duplicate, "tachypnoea"]))

    result = consult("Assess", {"vitals": {"oxygenSaturation": 88}}, assess_acuity=True)

    assert result["acuityReasons"] == [duplicate, "tachypnoea"]


def test_reasons_are_capped_at_five(fake_store, fake_llm):
    fake_store([("Text.", "Ghana STG — Malaria", ABOVE)])
    fake_llm(_acuity_json("CRITICAL", ["a", "b", "c"]))

    result = consult(
        "Assess",
        {
            "vitals": {
                "temperature": 40.0,
                "heartRate": 140,
                "respiratoryRate": 35,
                "systolicBp": 80,
                "oxygenSaturation": 85,
            }
        },
        assess_acuity=True,
    )

    # Five vitals breaches plus three model reasons, trimmed to five.
    assert len(result["acuityReasons"]) == 5


def test_stable_patient_reports_stable_with_no_reasons(fake_store, fake_llm):
    fake_store([("Text.", "Ghana STG — Malaria", ABOVE)])
    fake_llm(_acuity_json("STABLE", []))

    result = consult("Assess", {"vitals": {"temperature": 36.8}}, assess_acuity=True)

    assert result["acuityLevel"] == "STABLE"
    # None rather than [] — Express normalizes absent acuity to "not present".
    assert result["acuityReasons"] is None


def test_acuity_path_uses_the_acuity_system_prompt(fake_store, fake_llm):
    """The two paths ask for different things: prose in one, JSON in the other.
    Sending the prose prompt on the acuity path would fail to parse every
    time, and quietly fall back to URGENT for every patient."""
    fake_store([("Text.", "Ghana STG — Malaria", ABOVE)])
    llm = fake_llm(_acuity_json("STABLE", []))

    consult("Assess", {"vitals": {"temperature": 36.8}}, assess_acuity=True)

    system_message = llm.calls[0][0]["content"]
    assert "JSON" in system_message


def test_response_time_is_recorded(fake_store, fake_llm):
    fake_store([("Text.", "Ghana STG — Malaria", ABOVE)])
    fake_llm()

    result = consult("A question", {})

    assert isinstance(result["ragMetadata"]["responseTimeMs"], int)
    assert result["ragMetadata"]["responseTimeMs"] >= 0
