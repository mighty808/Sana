"""
Tests for _strip_retrieval_commentary — the backstop that removes any
sentence commenting on retrieval quality (e.g. "No strongly relevant
passages were found in the knowledge base.") from a model's answer, since
the system prompts' "don't mention this" instruction alone isn't reliably
obeyed.
"""

from rag.pipeline import _strip_retrieval_commentary


def test_removes_the_exact_reported_sentence():
    text = (
        "No strongly relevant passages were found in the knowledge base. "
        "Based on general clinical knowledge, this presentation is consistent with a viral illness."
    )
    assert _strip_retrieval_commentary(text) == (
        "Based on general clinical knowledge, this presentation is consistent with a viral illness."
    )


def test_removes_a_differently_phrased_sentence():
    text = (
        "The retrieved material has no strongly relevant passages for this question. "
        "Consider a tension headache given the presentation."
    )
    assert _strip_retrieval_commentary(text) == "Consider a tension headache given the presentation."


def test_leaves_unrelated_text_untouched():
    text = "Fever and headache with body pains are consistent with malaria. Consider an RDT to confirm."
    assert _strip_retrieval_commentary(text) == text


def test_never_returns_empty_even_if_every_sentence_matches():
    text = "No relevant passages were found."
    assert _strip_retrieval_commentary(text) == text
