"""
Measured retrieval quality against the labelled set in rag/eval_data.py.

This is the half of the evaluation that needs no LLM: it embeds each query,
searches the real vector store, and scores what comes back. That makes it
deterministic, free, and safe to run in CI — unlike rag/eval.py, which calls
Groq and stays a local before/after tool.

It does load the real embedding model and build the real store, so it is the
slowest file in the suite (tens of seconds cold, and it downloads ~80MB the
first time). That cost buys the only numbers in the project that say how well
retrieval actually works, rather than that it runs without erroring.

The thresholds below are floors with headroom, not targets. They were set from
measured baselines so that ordinary noise passes and a real regression fails;
each one records the figure it was calibrated against, so a future reader can
tell whether a change improved things or merely stayed above the line.
"""

import pytest

from rag.eval_data import IN_KB_QUERIES, OUT_OF_KB_QUERIES
from rag.pipeline import MIN_RELEVANCE_SCORE, TOP_K, _get_vectorstore

# Measured baselines (42-entry knowledge base, all-MiniLM-L6-v2, 25 in-KB and
# 8 out-of-KB queries):
#   hit-rate@5        1.000
#   MRR@5             0.933
#   grounded rate     0.880
#   refusal rate      1.000
MIN_HIT_RATE = 0.90
MIN_MRR = 0.80
MIN_GROUNDED_RATE = 0.80


@pytest.fixture(scope="module")
def store():
    """Module-scoped: building the store is the expensive part, and every test
    here reads it without mutating it."""
    return _get_vectorstore()


@pytest.fixture(scope="module")
def in_kb_results(store):
    """Runs every in-KB query once and caches the raw results, so the four
    metrics below don't each pay for a full pass over the query set."""
    results = {}
    for query, expected in IN_KB_QUERIES:
        hits = store.similarity_search_with_relevance_scores(query, k=TOP_K)
        results[query] = {
            "expected": expected,
            "titles": [doc.metadata.get("title") for doc, _score in hits],
            "top_score": hits[0][1] if hits else None,
        }
    return results


def test_the_labelled_set_only_names_documents_that_exist():
    """
    A typo in an expected title would make a query permanently unscoreable
    while every metric below still computed happily — the labelled document
    simply never matches, and the result looks like a retrieval failure
    instead of a data-entry one.
    """
    from rag.knowledge_base import DOCUMENTS

    known = {doc["title"] for doc in DOCUMENTS}
    for query, expected in IN_KB_QUERIES:
        unknown = set(expected) - known
        assert not unknown, f"{query!r} expects titles that aren't in the knowledge base: {unknown}"


def test_hit_rate(in_kb_results):
    """The share of in-KB questions whose expected document appears anywhere
    in the top K. This is the retriever's basic competence."""
    hits = sum(
        1 for r in in_kb_results.values() if any(t in r["expected"] for t in r["titles"])
    )
    hit_rate = hits / len(in_kb_results)

    misses = [q for q, r in in_kb_results.items() if not any(t in r["expected"] for t in r["titles"])]
    assert hit_rate >= MIN_HIT_RATE, (
        f"hit-rate@{TOP_K} fell to {hit_rate:.3f} (floor {MIN_HIT_RATE}). Missed: {misses}"
    )


def test_mean_reciprocal_rank(in_kb_results):
    """
    Rank-sensitive, unlike hit-rate: finding the right document at position 1
    scores 1.0, at position 5 scores 0.2. It catches a change that still
    retrieves the right passage but buries it, which matters because the
    prompt lists passages in order.
    """
    total = 0.0
    for r in in_kb_results.values():
        rank = next((i + 1 for i, t in enumerate(r["titles"]) if t in r["expected"]), None)
        total += 1 / rank if rank else 0.0
    mrr = total / len(in_kb_results)

    assert mrr >= MIN_MRR, f"MRR@{TOP_K} fell to {mrr:.3f} (floor {MIN_MRR})"


def test_grounded_rate(in_kb_results):
    """
    The share of in-KB questions where the top passage also clears
    MIN_RELEVANCE_SCORE — i.e. where the model is actually given grounding
    rather than told nothing relevant was found.

    This is deliberately the lowest of the four figures, and the gap is real:
    at the measured 0.880, roughly one in eight questions the knowledge base
    genuinely covers is answered as though it did not. The three known cases
    are documented in test_known_false_refusals below. Lowering
    MIN_RELEVANCE_SCORE would trade those back for out-of-KB leakage, because
    the two score distributions overlap — see that test for the numbers.
    """
    grounded = sum(
        1 for r in in_kb_results.values() if r["top_score"] is not None and r["top_score"] >= MIN_RELEVANCE_SCORE
    )
    rate = grounded / len(in_kb_results)

    assert rate >= MIN_GROUNDED_RATE, (
        f"grounded rate fell to {rate:.3f} (floor {MIN_GROUNDED_RATE}) — "
        f"more in-KB questions are now being answered without grounding"
    )


def test_out_of_kb_questions_are_refused(store):
    """
    The safety half of the eval, and the one held to 100%.

    A retriever that always returns something confident is worse than one that
    admits a gap: the model will synthesize a clinical-sounding answer from
    whatever it is handed. Every out-of-KB query must leave nothing above the
    threshold, so the prompt tells the model it has no grounding.
    """
    leaked = []
    for query in OUT_OF_KB_QUERIES:
        hits = store.similarity_search_with_relevance_scores(query, k=TOP_K)
        above = [(doc.metadata.get("title"), round(score, 4)) for doc, score in hits if score >= MIN_RELEVANCE_SCORE]
        if above:
            leaked.append((query, above))

    assert not leaked, (
        "these out-of-knowledge-base questions were given grounding they should not have had, "
        f"so the model will answer them as if the passages were relevant: {leaked}"
    )


def test_known_false_refusals(in_kb_results):
    """
    Documents a measured limitation rather than asserting it away.

    Three in-KB questions retrieve the right document within the top K but
    score below MIN_RELEVANCE_SCORE, so the model is told nothing relevant was
    found. Two of them are time-critical presentations:

        0.065  "Sudden weakness on one side of the body and slurred speech"
               (stroke — top hit was Acute Gastroenteritis)
        0.076  "Burning on passing urine with increased frequency"
               (UTI — top hit was Burns, a lexical collision on "burning")
        0.106  "Patient was bitten by a snake in the field"
               (Snake Bite WAS the top hit, just under the threshold)

    The threshold cannot be lowered to fix these without admitting out-of-KB
    questions: the distributions overlap. Out-of-KB tops run up to 0.167
    ("decompression sickness"), above two of the three figures here.

    Embedding the title alongside the text was tried and measured as a fix and
    made things worse — hit-rate 1.000 -> 0.960, grounded 0.880 -> 0.760 —
    because every title shares the "Ghana STG — " prefix, which dilutes each
    document's distinctive content.

    The real remedy is better retrieval, not a different cutoff: a stronger
    embedding model, or hybrid keyword-plus-vector search that would catch
    "snake bite" lexically regardless of embedding distance.

    This test asserts the count has not GROWN. If it drops, that is an
    improvement and the number below should be lowered to lock it in.
    """
    false_refusals = [
        query
        for query, r in in_kb_results.items()
        if any(t in r["expected"] for t in r["titles"])
        and r["top_score"] is not None
        and r["top_score"] < MIN_RELEVANCE_SCORE
    ]

    assert len(false_refusals) <= 3, (
        f"false refusals rose to {len(false_refusals)} (was 3): {false_refusals}"
    )
