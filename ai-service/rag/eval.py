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

from rag.pipeline import MIN_RELEVANCE_SCORE, consult

# Deliberately mixes three kinds of query:
#   - squarely inside the knowledge base — response should stay specific
#     and grounded in a named source.
#   - clearly outside it — response should hedge/say the knowledge base
#     doesn't cover this, not confidently answer from irrelevant passages.
#   - borderline/ambiguous — worth watching either way.
TEST_QUERIES: list[tuple[str, dict]] = [
    ("What's the management approach for severe malaria with danger signs?", {}),
    ("What's first-line treatment for hypertension in this population?", {}),
    ("What are the danger signs of pre-eclampsia I should watch for?", {}),
    ("How do I reset a staff member's hospital email password?", {}),
    ("What's the best pizza topping?", {}),
    ("Explain quantum computing to me.", {}),
    ("Patient presenting with chest pain and shortness of breath — what should I consider?", {}),
]


def main() -> None:
    if not os.getenv("GROQ_API_KEY"):
        raise SystemExit("GROQ_API_KEY is not set — this script calls the real pipeline, not a mock.")

    print(f"MIN_RELEVANCE_SCORE = {MIN_RELEVANCE_SCORE}\n")

    for query, patient_context in TEST_QUERIES:
        print("=" * 80)
        print(f"QUERY: {query}")
        result = consult(query, patient_context, assess_acuity=False)

        print("\nSources:")
        for source in result["sources"]:
            grounded = "grounded" if source["score"] >= MIN_RELEVANCE_SCORE else "excluded (below threshold)"
            print(f"  {source['score']:.4f}  [{grounded}]  {source['title']}")

        print(f"\nResponse:\n{result['diagnosticGuidance']}\n")


if __name__ == "__main__":
    main()
