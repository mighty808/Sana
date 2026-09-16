"""
Tests for _format_context — the function that turns the anonymized
patientContext dict into the prompt text the model actually reads.

Worth testing directly for two reasons. It is the last place patient data is
handled before it leaves the building, so what it does and does not include is
a privacy property, not just a formatting one. And a silently-dropped field
here degrades every answer without failing anything.
"""

from rag.pipeline import _format_context


def test_empty_context_says_so_explicitly():
    """The model must be told there was no context, rather than handed an
    empty string it might read as an omission to fill in."""
    assert _format_context({}) == "(no additional context provided)"


def test_chief_complaint_is_labelled():
    assert _format_context({"chiefComplaint": "Fever for 3 days"}) == "Chief complaint: Fever for 3 days"


def test_vitals_are_flattened_to_key_value_pairs():
    out = _format_context({"vitals": {"temperature": 39.1, "heartRate": 104}})
    assert out == "Vitals: temperature=39.1, heartRate=104"


def test_vitals_that_were_not_recorded_are_omitted():
    """A partially-filled vitals record is normal — the nurse may have taken a
    temperature but no BP. Printing `systolicBp=None` would invite the model to
    reason about a value nobody measured."""
    out = _format_context(
        {"vitals": {"temperature": 38.2, "systolicBp": None, "oxygenSaturation": None}}
    )
    assert out == "Vitals: temperature=38.2"


def test_vitals_present_but_all_empty_produces_no_vitals_line():
    out = _format_context({"vitals": {"temperature": None}, "chiefComplaint": "Cough"})
    assert out == "Chief complaint: Cough"


def test_symptoms_become_additional_notes():
    out = _format_context({"symptoms": ["night sweats", "weight loss"]})
    assert out == "Additional notes: night sweats, weight loss"


def test_lab_result_assembles_every_part_it_has():
    out = _format_context(
        {
            "testResult": {
                "testName": "Haemoglobin",
                "resultValue": "7.2",
                "unit": "g/dL",
                "referenceRange": "12-16 g/dL",
                "interpretation": "LOW",
            }
        }
    )
    assert out == "Lab result: Haemoglobin 7.2 g/dL (reference range: 12-16 g/dL) — LOW"


def test_lab_result_with_only_a_name_still_renders():
    """The Lab Tech's 'explain result' flow can send a sparse record; a missing
    unit or reference range must not drop the whole line."""
    assert _format_context({"testResult": {"testName": "Malaria RDT"}}) == "Lab result: Malaria RDT"


def test_lab_result_with_no_usable_fields_is_omitted_entirely():
    assert _format_context({"testResult": {}}) == "(no additional context provided)"


def test_sections_are_newline_separated_in_a_fixed_order():
    """Order is stable so two runs of the eval script produce comparable
    prompts — a reshuffled context would change the answer for reasons that
    have nothing to do with the change being evaluated."""
    out = _format_context(
        {
            "chiefComplaint": "Chest pain",
            "vitals": {"heartRate": 120},
            "symptoms": ["radiating to left arm"],
        }
    )
    assert out.splitlines() == [
        "Chief complaint: Chest pain",
        "Vitals: heartRate=120",
        "Additional notes: radiating to left arm",
    ]


def test_identifying_fields_are_never_rendered_even_if_they_somehow_arrive():
    """
    Anonymization is enforced upstream, in the Express layer
    (server/src/services/ai.service.ts's buildAnonymizedContext, which only
    ever reads chiefComplaint, vitals and symptoms). This asserts the Python
    side is a second line of defence rather than a passthrough: a key it does
    not recognise contributes nothing to the prompt.
    """
    out = _format_context(
        {
            "chiefComplaint": "Headache",
            "firstName": "Ama",
            "lastName": "Boateng",
            "patientNumber": "P-000123",
            "phone": "+233200000000",
        }
    )
    assert out == "Chief complaint: Headache"
    for leaked in ("Ama", "Boateng", "P-000123", "+233200000000"):
        assert leaked not in out
