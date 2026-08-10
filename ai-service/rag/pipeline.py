"""
The RAG (retrieval-augmented generation) pipeline behind MediAssist AI.

Flow (matches blueprint section 7.2):
  doctor's query + anonymized patient context
    -> embed query
    -> similarity search against the vector store (top-k passages)
    -> LangChain builds a prompt: system instructions + retrieved docs + context + query
    -> Groq/Llama generates a response
    -> return diagnostic guidance + source citations + a disclaimer
"""

import os
import time

from langchain_chroma import Chroma
from langchain_core.documents import Document
from langchain_groq import ChatGroq
from langchain_huggingface import HuggingFaceEmbeddings

from rag.knowledge_base import DOCUMENTS

# Small (~80MB), fast, runs locally with no API key — a reasonable default
# for an MVP with no OpenAI/embedding-provider budget. Swappable later for
# a stronger embedding model without touching the rest of the pipeline.
EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"

# Fast Groq-hosted Llama model — good balance of quality and latency for an
# interactive "doctor is waiting on this" request. Overridable via env var
# without a code change if a different model is preferred later.
LLM_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")

# Where the Chroma vector store persists to disk between server restarts —
# gitignored (see root .gitignore's "ai-service/chroma_db/") since it's
# regenerable from rag/knowledge_base.py, not source material itself.
CHROMA_DIR = os.path.join(os.path.dirname(__file__), "..", "chroma_db")

TOP_K = 3

DISCLAIMER = (
    "MediAssist AI provides decision support only — it does not diagnose. "
    "This response synthesizes retrieved reference material and must be "
    "reviewed against your own clinical judgement before it informs care."
)

_vectorstore: Chroma | None = None
_llm: ChatGroq | None = None


def _get_vectorstore() -> Chroma:
    """
    Lazily creates (or loads, if already persisted) the Chroma vector store,
    and seeds it from the starter knowledge base the FIRST time it's empty.
    Lazy + module-level cached so the embedding model only loads once per
    process, not once per request.
    """
    global _vectorstore
    if _vectorstore is not None:
        return _vectorstore

    embeddings = HuggingFaceEmbeddings(model_name=EMBEDDING_MODEL)
    store = Chroma(
        collection_name="sana_medical_kb",
        embedding_function=embeddings,
        persist_directory=CHROMA_DIR,
    )

    # `._collection` reaches into a private attribute — langchain_chroma's
    # Chroma wrapper doesn't expose a public "how many documents are in
    # here" method as of this version, and this is the commonly-used
    # workaround in the LangChain community for exactly this "seed once"
    # check. If a future langchain_chroma version removes/renames it, this
    # will need updating.
    if store._collection.count() == 0:
        docs = [
            Document(page_content=d["text"], metadata={"title": d["title"]})
            for d in DOCUMENTS
        ]
        store.add_documents(docs)

    _vectorstore = store
    return store


def _get_llm() -> ChatGroq:
    global _llm
    if _llm is None:
        _llm = ChatGroq(model=LLM_MODEL, temperature=0.2)
    return _llm


def _format_context(patient_context: dict) -> str:
    """Turns the anonymized patientContext dict into readable prompt text."""
    parts = []
    if patient_context.get("chiefComplaint"):
        parts.append(f"Chief complaint: {patient_context['chiefComplaint']}")
    vitals = patient_context.get("vitals")
    if vitals:
        vital_bits = [f"{k}={v}" for k, v in vitals.items() if v is not None]
        if vital_bits:
            parts.append("Vitals: " + ", ".join(vital_bits))
    symptoms = patient_context.get("symptoms")
    if symptoms:
        parts.append("Reported symptoms: " + ", ".join(symptoms))
    return "\n".join(parts) if parts else "(no additional context provided)"


SYSTEM_PROMPT = (
    "You are MediAssist AI, a clinical decision-SUPPORT assistant embedded in a "
    "hospital system used by licensed doctors. You do not diagnose and you do not "
    "replace clinical judgement. Given a doctor's question, anonymized patient "
    "context, and retrieved reference passages, synthesize a concise, clinically "
    "useful answer grounded in the retrieved passages. If the passages don't "
    "clearly cover the situation, say so plainly rather than speculating beyond "
    "them. Never invent a specific diagnosis as fact — frame guidance in terms of "
    "differentials, red flags, and recommended next steps. Keep the answer focused "
    "and structured (short paragraphs or a brief list), suitable for a doctor to "
    "read in under a minute."
)


def consult(query: str, patient_context: dict) -> dict:
    """
    Runs the full RAG pipeline for one query and returns a dict matching
    the ConsultResponse shape the Express server expects (see main.py).
    """
    started = time.monotonic()

    store = _get_vectorstore()
    results = store.similarity_search_with_relevance_scores(query, k=TOP_K)

    context_block = "\n\n".join(
        f"[{doc.metadata.get('title', 'Untitled')}]\n{doc.page_content}" for doc, _score in results
    )
    context_text = _format_context(patient_context)

    user_prompt = (
        f"Patient context:\n{context_text}\n\n"
        f"Retrieved reference material:\n{context_block or '(no relevant passages retrieved)'}\n\n"
        f"Doctor's question: {query}"
    )

    llm = _get_llm()
    completion = llm.invoke(
        [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ]
    )

    response_time_ms = int((time.monotonic() - started) * 1000)

    return {
        "diagnosticGuidance": completion.content,
        "sources": [
            {
                "title": doc.metadata.get("title", "Untitled"),
                "excerpt": doc.page_content[:280],
                "score": round(float(score), 4),
            }
            for doc, score in results
        ],
        "disclaimer": DISCLAIMER,
        "ragMetadata": {
            "model": LLM_MODEL,
            "retrievalCount": len(results),
            "responseTimeMs": response_time_ms,
        },
    }
