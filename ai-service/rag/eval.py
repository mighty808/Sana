"""
Manual eval script for the Sana AI RAG pipeline — not part of the request
path, just a repeatable way to check whether a pipeline change actually
improved response quality instead of spot-checking in the running app.

Run it before a change (save the output) and after, and diff the two:
  ./venv/Scripts/python -m rag.eval > before.txt
  ...make changes...
  ./venv/Scripts/python -m rag.eval > after.txt

It sends a fixed mix of queries straight through consult() (no HTTP, no
Express server needed — just GROQ_API_KEY in the environment) and prints,
per query: the retrieved sources with their relevance scores, whether each
cleared MIN_RELEVANCE_SCORE, and the model's response.
"""

import os
import sys

from dotenv import load_dotenv

load_dotenv()

# Windows' console defaults to cp1252, which can't encode characters this
# knowledge base uses (em dashes, non-breaking hyphens); force UTF-8 so the
# script doesn't crash mid-run on an otherwise-successful response.
sys.stdout.reconfigure(encoding="utf-8")

from rag.eval_data import IN_KB_QUERIES, OUT_OF_KB_QUERIES
from rag.pipeline import LLM_MODEL, MIN_RELEVANCE_SCORE, consult

# The queries come from rag/eval_data.py, the same labelled set
# tests/test_retrieval.py scores — so the retrieval numbers in CI and the
# generated answers reviewed here describe the same questions, rather than two
# unrelated samples that can't be reasoned about together.
#
# A subset, not the whole set: this calls the real LLM once per query, so the
# full 33 would be slow and cost real API quota on every run. These are chosen
# to span the behaviours worth eyeballing — squarely in-KB, an in-KB question
# known to score below the threshold, and out-of-KB questions the model should
# refuse rather than answer confidently.
IN_KB_SAMPLE = 5
OUT_OF_KB_SAMPLE = 3


def _sample_queries() -> list[tuple[str, bool]]:
    """Returns (query, expected_to_be_grounded) pairs."""
    return [(query, True) for query, _titles in IN_KB_QUERIES[:IN_KB_SAMPLE]] + [
        (query, False) for query in OUT_OF_KB_QUERIES[:OUT_OF_KB_SAMPLE]
    ]


def main() -> None:
    if not os.getenv("GROQ_API_KEY"):
        raise SystemExit("GROQ_API_KEY is not set — this script calls the real pipeline, not a mock.")

    print(f"model               = {LLM_MODEL}")
    print(f"MIN_RELEVANCE_SCORE = {MIN_RELEVANCE_SCORE}\n")

    # Tallied as we go and printed at the end, so two saved runs can be
    # compared at a glance before reading the prose. Diffing the full output
    # is still where the real signal is — the LLM's wording changes run to
    # run even at temperature 0.2, so a changed summary line is the reliable
    # indicator that something structural moved.
    grounded_when_expected = 0
    refused_when_expected = 0
    total_latency_ms = 0

    queries = _sample_queries()
    for query, expect_grounded in queries:
        print("=" * 80)
        print(f"QUERY: {query}")
        print(f"  (expected: {'grounded in the knowledge base' if expect_grounded else 'no relevant passages'})")
        result = consult(query, {}, assess_acuity=False)

        print("\nSources:")
        for source in result["sources"]:
            label = "grounded" if source["grounded"] else "excluded (below threshold)"
            print(f"  {source['score']:.4f}  [{label}]  {source['title']}")

        any_grounded = any(source["grounded"] for source in result["sources"])
        if expect_grounded and any_grounded:
            grounded_when_expected += 1
        if not expect_grounded and not any_grounded:
            refused_when_expected += 1

        total_latency_ms += result["ragMetadata"]["responseTimeMs"]
        print(f"\nResponse:\n{result['diagnosticGuidance']}\n")

    in_kb_total = min(IN_KB_SAMPLE, len(IN_KB_QUERIES))
    out_of_kb_total = min(OUT_OF_KB_SAMPLE, len(OUT_OF_KB_QUERIES))

    print("=" * 80)
    print("SUMMARY")
    print(f"  in-KB grounded      {grounded_when_expected}/{in_kb_total}")
    print(f"  out-of-KB refused   {refused_when_expected}/{out_of_kb_total}")
    print(f"  mean latency        {total_latency_ms // len(queries)}ms")
    print()
    print("  Retrieval quality is measured properly, without an LLM, in")
    print("  tests/test_retrieval.py — run `pytest tests/test_retrieval.py -q`.")
    print("  This script exists to inspect what the model does with what it")
    print("  was given, which no automated assertion covers.")


if __name__ == "__main__":
    main()
