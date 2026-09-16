"""
Tests for _assess_vitals — the deterministic half of the acuity read.

This is the most safety-critical function in the service and the only part of
the triage decision that does NOT depend on the LLM. It exists precisely so an
objectively dangerous vital sign is caught even when the model's own read
undersells it (see consult()'s `max(vitals_level, llm_level)`), so it has to be
correct on its own terms.

Levels are the raw ints the function returns: 0 STABLE, 1 URGENT, 2 CRITICAL.
"""

import pytest

from rag.pipeline import ACUITY_LEVELS, _assess_vitals

STABLE, URGENT, CRITICAL = 0, 1, 2


def test_no_vitals_is_stable_with_no_reasons():
    """An empty dict must not invent a concern — a patient with nothing
    recorded is not thereby urgent."""
    assert _assess_vitals({}) == (STABLE, [])


def test_all_vitals_within_range_is_stable():
    level, reasons = _assess_vitals(
        {
            "temperature": 36.8,
            "heartRate": 72,
            "respiratoryRate": 16,
            "systolicBp": 120,
            "oxygenSaturation": 98,
        }
    )
    assert level == STABLE
    assert reasons == []


def test_none_values_are_skipped_entirely():
    """A vital that wasn't recorded is absent, not zero. Treating a missing
    systolic BP as 0 would flag every partially-recorded patient CRITICAL."""
    level, reasons = _assess_vitals(
        {
            "temperature": None,
            "heartRate": None,
            "respiratoryRate": None,
            "systolicBp": None,
            "oxygenSaturation": None,
        }
    )
    assert (level, reasons) == (STABLE, [])


# Each row is (field, value, expected level). The bands come straight from
# _assess_vitals' own cutoffs; the point of listing them here is that a later
# edit to a threshold has to be a deliberate edit to this table too.
@pytest.mark.parametrize(
    "field,value,expected",
    [
        # temperature: urgent >=38.5 or <36; critical >=39.5 or <35
        ("temperature", 38.9, URGENT),
        ("temperature", 39.5, CRITICAL),
        ("temperature", 35.5, URGENT),
        ("temperature", 34.5, CRITICAL),
        # heartRate: urgent <50 or >110; critical <40 or >130
        ("heartRate", 115, URGENT),
        ("heartRate", 131, CRITICAL),
        ("heartRate", 45, URGENT),
        ("heartRate", 38, CRITICAL),
        # respiratoryRate: urgent <12 or >24; critical <8 or >30
        ("respiratoryRate", 26, URGENT),
        ("respiratoryRate", 32, CRITICAL),
        ("respiratoryRate", 10, URGENT),
        ("respiratoryRate", 6, CRITICAL),
        # systolicBp: urgent <100 or >180; critical <90
        ("systolicBp", 95, URGENT),
        ("systolicBp", 185, URGENT),
        ("systolicBp", 85, CRITICAL),
        # oxygenSaturation: urgent <94; critical <90
        ("oxygenSaturation", 92, URGENT),
        ("oxygenSaturation", 88, CRITICAL),
    ],
)
def test_each_vital_lands_in_its_band(field, value, expected):
    level, reasons = _assess_vitals({field: value})
    assert level == expected
    # A flagged vital must always explain itself — a level with no reason
    # gives the nurse nothing to act on.
    assert len(reasons) == 1
    assert str(value) in reasons[0]


def test_level_is_the_worst_vital_not_the_last_one_checked():
    """
    _assess_vitals walks the vitals in a fixed order and calls flag() for each
    breach. If it assigned rather than max()'d, a critical oxygen saturation
    checked early would be overwritten by a merely-urgent value checked later.
    Oxygen saturation is checked LAST in the function, so this orders the
    critical one FIRST to make the regression detectable.
    """
    level, reasons = _assess_vitals(
        {
            "temperature": 34.0,      # critical, checked first
            "oxygenSaturation": 92,   # urgent, checked last
        }
    )
    assert level == CRITICAL
    assert len(reasons) == 2


def test_every_breached_vital_contributes_its_own_reason():
    level, reasons = _assess_vitals(
        {
            "temperature": 39.8,
            "heartRate": 135,
            "respiratoryRate": 33,
            "systolicBp": 85,
            "oxygenSaturation": 85,
        }
    )
    assert level == CRITICAL
    assert len(reasons) == 5


def test_boundary_values_are_not_flagged():
    """
    The comparisons are strict on one side and inclusive on the other; these
    are the exact values that sit on the safe edge of each band. A test that
    only used obviously-normal numbers would pass even if a `<` became a `<=`.
    """
    level, reasons = _assess_vitals(
        {
            "temperature": 36.0,      # `< 36` is urgent, so 36.0 is not
            "heartRate": 110,         # `> 110` is urgent, so 110 is not
            "respiratoryRate": 12,    # `< 12` is urgent, so 12 is not
            "systolicBp": 100,        # `< 100` is urgent, so 100 is not
            "oxygenSaturation": 94,   # `< 94` is urgent, so 94 is not
        }
    )
    assert (level, reasons) == (STABLE, [])


def test_acuity_level_names_cover_every_numeric_level():
    """consult() indexes ACUITY_LEVEL_NAMES with whatever _assess_vitals
    returns, so the two have to stay aligned."""
    assert set(ACUITY_LEVELS.values()) == {STABLE, URGENT, CRITICAL}
