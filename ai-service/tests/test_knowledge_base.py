"""
Invariants for the knowledge base itself.

Most of this suite is pure and instant. The token-budget test at the bottom is
the exception: it loads the real tokenizer for the embedding model, which
downloads it (~80MB, cached afterwards) the first time it runs. That cost is
worth paying because the property it protects is invisible by inspection — an
over-long entry does not error, it just stops being fully embedded.
"""

import pytest

from rag.knowledge_base import DOCUMENTS
from rag.pipeline import EMBEDDING_MODEL

# all-MiniLM-L6-v2 truncates its input at 256 word-pieces. Note this is NOT
# the same as the tokenizer's `model_max_length`, which reports 512 — the
# sentence-transformers model config caps the sequence lower than the
# underlying BERT tokenizer would allow, and it is the lower number that
# decides what actually gets embedded.
EMBEDDING_TOKEN_LIMIT = 256


def test_the_knowledge_base_is_not_empty():
    assert len(DOCUMENTS) > 0


def test_every_entry_has_a_title_and_text():
    for doc in DOCUMENTS:
        assert set(doc) == {"title", "text"}, f"unexpected keys in {doc.get('title')!r}"
        assert doc["title"].strip(), "an entry has a blank title"
        assert doc["text"].strip(), f"{doc['title']!r} has no text"


def test_titles_are_unique():
    """
    Titles are the identity of a source in three places: the chip shown beside
    an answer, the `expected` labels in rag/eval_data.py, and the Chroma
    metadata. Two entries sharing one title makes a retrieval hit ambiguous and
    quietly corrupts the eval scores.
    """
    titles = [doc["title"] for doc in DOCUMENTS]
    duplicates = {title for title in titles if titles.count(title) > 1}
    assert not duplicates, f"duplicate titles: {sorted(duplicates)}"


def test_every_entry_is_substantial_enough_to_retrieve():
    """A one-line entry embeds poorly and tends to match everything weakly.
    The shortest real entry today is around 650 characters."""
    for doc in DOCUMENTS:
        assert len(doc["text"]) >= 300, f"{doc['title']!r} is too short to be useful grounding"


def test_entries_fit_inside_the_embedding_window():
    """
    The failure this prevents is silent. If an entry exceeds the model's
    256-token limit, the tail is dropped before the vector is computed — and
    in these documents the tail is usually the management and referral advice,
    the most clinically useful part. Nothing errors; the passage just stops
    being findable by the questions it should answer.

    Measured with the real tokenizer rather than a chars-per-token estimate,
    because medical vocabulary ("haemoptysis", "GeneXpert") splits into far
    more word-pieces than ordinary prose.
    """
    transformers = pytest.importorskip(
        "transformers", reason="transformers ships with sentence-transformers; skipped if absent"
    )
    tokenizer = transformers.AutoTokenizer.from_pretrained(EMBEDDING_MODEL)

    oversized = []
    for doc in DOCUMENTS:
        count = len(tokenizer.encode(doc["text"]))
        if count > EMBEDDING_TOKEN_LIMIT:
            oversized.append(f"{doc['title']} ({count} tokens)")

    assert not oversized, (
        "these entries would be silently truncated before embedding — "
        f"split them into two documents: {oversized}"
    )
