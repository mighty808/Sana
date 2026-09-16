"""
The RAG (retrieval-augmented generation) pipeline behind Sana AI.

Here's the flow, step by step:
  1. A staff member's question, plus anonymized patient context, comes in.
  2. The question is turned into an embedding (a numeric representation of its meaning).
  3. That embedding is used to search the vector store for the most similar
     reference passages.
  4. LangChain builds a prompt out of the system instructions, those
     retrieved passages, the patient context, and the question.
  5. That prompt is sent to Groq's hosted LLM, which generates a response.
  6. The response comes back along with the source passages it was based on
     and a disclaimer.
"""

import hashlib
import json
import logging
import os
import re
import time

from langchain_chroma import Chroma
from langchain_core.documents import Document
from langchain_groq import ChatGroq
from langchain_huggingface import HuggingFaceEmbeddings

from rag.knowledge_base import DOCUMENTS

# The service previously logged nothing at all, which made a production
# failure a black box: a 503 reached Express with no record on this side of
# what actually broke. uvicorn configures the root logger, so records emitted
# here land in the same stream as its access log with no extra setup.
logger = logging.getLogger("sana.rag")

# This embedding model is small (about 80MB), fast, and runs locally
# without needing an API key or a paid subscription to an embedding
# provider, which makes it a reasonable default for now. It can be swapped
# out for a stronger model later without changing anything else in this pipeline.
EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"

# A general-purpose chat model hosted by Groq, chosen as a good balance
# between answer quality and response speed for a request where someone is
# actively waiting on the answer. It can be overridden through the
# GROQ_MODEL environment variable, without a code change, if a different
# model is preferred later.
LLM_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")

# Where the Chroma vector store saves its data to disk, so it survives a
# server restart instead of rebuilding from scratch every time. This
# folder is excluded from git (see "ai-service/chroma_db/" in the root
# .gitignore), since it can always be regenerated from
# rag/knowledge_base.py — it isn't itself a source of information that
# needs to be tracked.
CHROMA_DIR = os.path.join(os.path.dirname(__file__), "..", "chroma_db")

TOP_K = 5

# Passages scoring below this are excluded from what the LLM sees as
# grounding material (they still appear in the returned `sources` list with
# their real score, so the UI can still show a loosely-related result).
# Chroma's relevance score here isn't a clean 0-1 probability — for this
# embedding model/collection it can go negative — but empirically, sampling
# real queries against this knowledge base, in-KB questions consistently
# score their top passage in the 0.27-0.48 range, while every out-of-KB
# question sampled scored every passage below 0, including its "best"
# match. 0.2 sits cleanly in the gap between those two clusters.
MIN_RELEVANCE_SCORE = 0.2

DISCLAIMER = (
    "Sana AI provides decision support only — it does not diagnose. "
    "This response synthesizes retrieved reference material and must be "
    "reviewed against your own clinical judgement before it informs care."
)

_vectorstore: Chroma | None = None
_llm: ChatGroq | None = None


def knowledge_base_fingerprint() -> str:
    """
    A stable SHA-256 over the knowledge base's contents.

    This is what makes an edit to rag/knowledge_base.py actually take effect.
    The store used to be seeded only when it was empty, which meant that once
    chroma_db/ existed on disk, every later edit to the knowledge base was
    silently ignored — the service kept answering from the version that
    happened to be embedded first, and nothing anywhere said so. Deleting the
    folder by hand was the only fix, and only if you knew to do it.

    Titles are included alongside the text because a title is what gets shown
    as the source next to an answer and what rag/eval_data.py labels against,
    so a retitled entry is a change worth re-embedding for.
    """
    digest = hashlib.sha256()
    for doc in DOCUMENTS:
        digest.update(doc["title"].encode("utf-8"))
        digest.update(b"\x00")
        digest.update(doc["text"].encode("utf-8"))
        digest.update(b"\x00")
    return digest.hexdigest()


# Key under which the fingerprint above is stored in the Chroma collection's
# own metadata, so it travels with the persisted store rather than living in a
# separate file that could get out of step with it.
_FINGERPRINT_KEY = "sana_kb_fingerprint"


def _get_vectorstore() -> Chroma:
    """
    Creates the Chroma vector store the first time it's needed (or loads it
    from disk, if it was already saved there from a previous run), and seeds
    it from rag/knowledge_base.py whenever the persisted copy doesn't match
    the knowledge base currently in the source tree. Cached at the module
    level so the embedding model only gets loaded once per running process,
    instead of once per request.
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

    fingerprint = knowledge_base_fingerprint()

    # `._collection` reaches into a private attribute of the Chroma wrapper,
    # since it doesn't expose a public way to read a collection's document
    # count or its metadata. This is the workaround commonly used for exactly
    # this kind of check. If a future version of langchain_chroma removes or
    # renames this attribute, this block needs updating to match — which is
    # why it's wrapped: a failure to *check* staleness should degrade to
    # "re-seed anyway", never to an unanswerable request.
    try:
        collection = store._collection
        count = collection.count()
        stored_fingerprint = (collection.metadata or {}).get(_FINGERPRINT_KEY)
    except Exception:  # noqa: BLE001 — see the comment above.
        logger.exception("Could not inspect the vector store; re-seeding from scratch")
        count, stored_fingerprint = 0, None

    if count > 0 and stored_fingerprint == fingerprint:
        logger.info("Vector store is current: %d passages, fingerprint %s", count, fingerprint[:12])
    else:
        if count > 0:
            # The knowledge base changed under a populated store. Everything
            # in it was embedded from the old text, so it all goes — adding
            # the new documents alongside would leave the store answering
            # from both versions at once.
            logger.info(
                "Knowledge base changed (stored %s, current %s) — re-seeding %d passages",
                (stored_fingerprint or "none")[:12],
                fingerprint[:12],
                len(DOCUMENTS),
            )
            existing = collection.get(include=[])
            if existing["ids"]:
                collection.delete(ids=existing["ids"])
        else:
            logger.info("Vector store is empty — seeding %d passages", len(DOCUMENTS))

        store.add_documents(
            [
                Document(page_content=d["text"], metadata={"title": d["title"]})
                for d in DOCUMENTS
            ]
        )
        # Written only after the documents land, so an interrupted seed leaves
        # a fingerprint that still doesn't match and gets retried next boot,
        # rather than a half-filled store marked as current.
        store._collection.modify(metadata={_FINGERPRINT_KEY: fingerprint})

    _vectorstore = store
    return store


def _get_llm() -> ChatGroq:
    global _llm
    if _llm is None:
        # `max_tokens` is a hard limit on the response length, on top of
        # the length instruction already built into SYSTEM_PROMPT below.
        # Sana AI is meant to give a quick decision-support summary, not a
        # full explanation, so this limit stops a runaway answer even if
        # the prompt's own instructions don't. The model also spends part
        # of this token budget on its own internal reasoning before it
        # writes the visible answer, so the limit needs to leave room for
        # that in addition to "a few sentences of actual text". Setting it
        # too low (300 was tried) cut a real answer off mid-word, so 700 is
        # used instead to leave that extra headroom — including for the
        # nurse acuity path below, whose JSON wrapper adds a little more
        # length on top of the guidance text itself.
        #
        # `timeout` and `max_retries` exist to stay inside the caller's
        # patience rather than the library's. Express aborts this request at
        # 20s (server/src/services/ai.service.ts's AbortSignal.timeout) and
        # shows "AI service unavailable"; without a limit here, Python never
        # learned that and kept working on an answer nobody was waiting for,
        # logging nothing. One retry at 15s each would exceed 20s, so the
        # retry is only useful for a fast failure (a connection reset, a 5xx)
        # — which is the case actually worth retrying. A slow response is not
        # retried into a second slow response.
        _llm = ChatGroq(
            model=LLM_MODEL,
            temperature=0.2,
            max_tokens=700,
            timeout=15,
            max_retries=1,
        )
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
    test_result = patient_context.get("testResult")
    if test_result:
        bits = []
        if test_result.get("testName"):
            bits.append(test_result["testName"])
        value_bits = [str(test_result[k]) for k in ("resultValue", "unit") if test_result.get(k)]
        if value_bits:
            bits.append(" ".join(value_bits))
        if test_result.get("referenceRange"):
            bits.append(f"(reference range: {test_result['referenceRange']})")
        if test_result.get("interpretation"):
            bits.append(f"— {test_result['interpretation']}")
        if bits:
            parts.append("Lab result: " + " ".join(bits))
    symptoms = patient_context.get("symptoms")
    if symptoms:
        parts.append("Additional notes: " + ", ".join(symptoms))
    return "\n".join(parts) if parts else "(no additional context provided)"


# Ordering used to combine the vitals-threshold check with the LLM's own
# acuity read: whichever of the two considers the patient worse always
# wins, so a hard vitals breach can never be softened by a milder LLM read.
ACUITY_LEVELS = {"STABLE": 0, "URGENT": 1, "CRITICAL": 2}
ACUITY_LEVEL_NAMES = {v: k for k, v in ACUITY_LEVELS.items()}


def _assess_vitals(vitals: dict) -> tuple[int, list[str]]:
    """
    Checks the recorded vitals against fixed numeric thresholds and returns
    an acuity level (0=stable, 1=urgent, 2=critical) plus the specific
    reasons behind it. These are general adult early-warning-score-style
    cutoffs, not tuned per condition, age, or pregnancy — they exist as a
    hard safety net underneath the LLM's own read, so an objectively
    dangerous vital sign is never missed even if the LLM's answer
    undersells it.
    """
    level = 0
    reasons: list[str] = []

    def flag(new_level: int, reason: str) -> None:
        nonlocal level
        reasons.append(reason)
        level = max(level, new_level)

    temperature = vitals.get("temperature")
    if temperature is not None:
        if temperature >= 39.5 or temperature < 35:
            flag(2, f"Temperature {temperature}°C is critically abnormal")
        elif temperature >= 38.5 or temperature < 36:
            flag(1, f"Temperature {temperature}°C is outside the normal range")

    heart_rate = vitals.get("heartRate")
    if heart_rate is not None:
        if heart_rate < 40 or heart_rate > 130:
            flag(2, f"Heart rate {heart_rate} bpm is critically abnormal")
        elif heart_rate < 50 or heart_rate > 110:
            flag(1, f"Heart rate {heart_rate} bpm is outside the normal range")

    respiratory_rate = vitals.get("respiratoryRate")
    if respiratory_rate is not None:
        if respiratory_rate < 8 or respiratory_rate > 30:
            flag(2, f"Respiratory rate {respiratory_rate}/min is critically abnormal")
        elif respiratory_rate < 12 or respiratory_rate > 24:
            flag(1, f"Respiratory rate {respiratory_rate}/min is outside the normal range")

    systolic_bp = vitals.get("systolicBp")
    if systolic_bp is not None:
        if systolic_bp < 90:
            flag(2, f"Systolic BP {systolic_bp} mmHg is critically low")
        elif systolic_bp < 100 or systolic_bp > 180:
            flag(1, f"Systolic BP {systolic_bp} mmHg is outside the normal range")

    oxygen_saturation = vitals.get("oxygenSaturation")
    if oxygen_saturation is not None:
        if oxygen_saturation < 90:
            flag(2, f"Oxygen saturation {oxygen_saturation}% is critically low")
        elif oxygen_saturation < 94:
            flag(1, f"Oxygen saturation {oxygen_saturation}% is below normal")

    return level, reasons


ACUITY_SYSTEM_PROMPT = (
    "You are Sana AI, helping a nurse triage a patient before the doctor sees them, "
    "using retrieved reference passages plus the patient's chief complaint and "
    "vitals. You do not diagnose.\n\n"
    "Respond with ONLY a single JSON object — no markdown code fences, no text "
    "before or after it — with exactly these keys:\n"
    '  "acuityLevel": one of "STABLE", "URGENT", or "CRITICAL", based on how '
    "urgently this patient needs the doctor's attention given the danger "
    "signs/red flags described in the reference passages and the vitals/complaint "
    "given;\n"
    '  "reasons": a list of up to 3 short phrases (a few words each) naming the '
    "specific findings driving that level — an empty list if STABLE;\n"
    '  "guidance": 2-4 sentences of plain prose for the nursing care team on what '
    "to watch for and do before the doctor arrives, grounded in the retrieved "
    "passages. Never invent a specific diagnosis as fact.\n\n"
    "Only state a specific numeric threshold, dose, or named drug/regimen if it "
    "appears in the retrieved passages — otherwise speak in general terms (e.g. "
    "'an appropriate antibiotic per protocol' rather than naming one). If the "
    "retrieved material says no passages are strongly relevant, say so plainly in "
    "the guidance and default to STABLE unless the vitals/complaint themselves are "
    "clearly dangerous, rather than speculating beyond what was retrieved."
)

# No re.MULTILINE here on purpose: ^/$ must anchor to the whole string, not
# every line within it, otherwise a line inside the JSON's own "guidance"
# text that happens to start or end with backticks would get corrupted too.
_JSON_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE)


def _run_acuity_llm(user_prompt: str) -> tuple[int, list[str], str]:
    """
    Asks the LLM for a structured triage read (acuityLevel, reasons,
    guidance) as JSON, grounded in the same retrieved passages and patient
    context the plain-guidance path uses. Falls back to a fail-safe URGENT
    level with the raw response as guidance if the model doesn't return
    parseable JSON, rather than silently treating an unparseable answer as
    stable.
    """
    llm = _get_llm()
    completion = llm.invoke(
        [
            {"role": "system", "content": ACUITY_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ]
    )
    raw = str(completion.content)

    try:
        parsed = json.loads(_JSON_FENCE_RE.sub("", raw.strip()))
        level = ACUITY_LEVELS[str(parsed["acuityLevel"]).upper()]
        reasons = [r for r in parsed.get("reasons", []) if isinstance(r, str)][:3]
        guidance = str(parsed["guidance"])
        return level, reasons, guidance
    except (json.JSONDecodeError, KeyError, TypeError, ValueError):
        return (
            1,
            ["Sana AI's structured triage read failed to parse — review the response text directly"],
            raw,
        )


SYSTEM_PROMPT = (
    "You are Sana AI, a clinical decision-SUPPORT assistant embedded in a "
    "hospital system used by licensed doctors, nurses, and laboratory technicians. "
    "You do not diagnose and you do not replace clinical judgement. Given a "
    "hospital staff member's question, anonymized patient context, and retrieved "
    "reference passages, synthesize a clinically useful answer grounded in the "
    "retrieved passages. If the passages don't clearly cover the situation, say "
    "so plainly in one sentence rather than speculating beyond them. Never invent "
    "a specific diagnosis as fact — frame guidance in terms of differentials, red "
    "flags, and recommended next steps. Only state a specific numeric threshold, "
    "dose, or named drug/regimen if it appears in the retrieved passages — "
    "otherwise speak in general terms (e.g. 'an appropriate antibiotic per "
    "protocol' rather than naming one). If the retrieved material says no "
    "passages are strongly relevant, lead with that rather than answering as if "
    "the retrieved passages were solid grounding.\n\n"
    "STRICT FORMAT — this is a quick decision-support summary, not an "
    "explanation: respond in 2-4 sentences of plain prose, optionally "
    "followed by up to 3 short bullet points ONLY if there are specific red "
    "flags or next steps worth calling out separately. Never write more than "
    "one paragraph of prose. Never restate the question, the patient "
    "context, or the retrieved passages back — go straight to the answer. "
    "No headers, no lengthy caveats beyond the one-sentence rule above."
)


def consult(query: str, patient_context: dict, assess_acuity: bool = False) -> dict:
    """
    Runs the full RAG pipeline for one query, and returns a dict shaped to
    match the ConsultResponse model the Express server expects (see main.py).

    When assess_acuity is True (only the nurse's "AI Analysis" button sets
    this — see ai.service.ts's analyzeVitalsForNurse), this also works out
    an acuityLevel/acuityReasons triage read: a hard numeric check on the
    vitals (_assess_vitals) combined with the LLM's own read of the
    retrieved knowledge-base passages (_run_acuity_llm), taking whichever
    of the two is more severe.
    """
    started = time.monotonic()

    store = _get_vectorstore()
    results = store.similarity_search_with_relevance_scores(query, k=TOP_K)

    # Only passages that clear MIN_RELEVANCE_SCORE are shown to the LLM as
    # grounding material — a weak match is worse than no match, since the
    # model tends to synthesize an answer from whatever it's given even
    # when nothing retrieved is actually relevant to the question.
    grounded_results = [(doc, score) for doc, score in results if score >= MIN_RELEVANCE_SCORE]

    # Logged before the LLM call rather than after, so a request that later
    # times out still leaves a record of what was retrieved for it. The top
    # score and the grounded count are the two numbers that explain almost
    # every "why did it answer that?" question: a confident-sounding answer
    # with 0 grounded passages is the pipeline working as designed and the
    # knowledge base not covering the question.
    top_score = max((score for _doc, score in results), default=None)
    logger.info(
        "consult: retrieved=%d grounded=%d top_score=%s acuity=%s query=%.80r",
        len(results),
        len(grounded_results),
        f"{top_score:.4f}" if top_score is not None else "n/a",
        assess_acuity,
        query,
    )
    if not grounded_results:
        # Not a warning: refusing to ground an out-of-scope question is the
        # correct behaviour, and the prompt tells the model to say so. It is
        # worth its own line because a sudden run of these is the signature of
        # a broken embedding model or an empty store.
        logger.info("consult: nothing cleared MIN_RELEVANCE_SCORE=%s", MIN_RELEVANCE_SCORE)

    context_block = "\n\n".join(
        f"[{doc.metadata.get('title', 'Untitled')}]\n{doc.page_content}" for doc, _score in grounded_results
    )
    context_text = _format_context(patient_context)

    user_prompt = (
        f"Patient context:\n{context_text}\n\n"
        f"Retrieved reference material:\n"
        f"{context_block or '(no passages in the knowledge base are strongly relevant to this question)'}\n\n"
        f"Question: {query}"
    )

    acuity_level: int | None = None
    acuity_reasons: list[str] = []

    if assess_acuity:
        vitals_level, vitals_reasons = _assess_vitals(patient_context.get("vitals") or {})
        llm_level, llm_reasons, guidance = _run_acuity_llm(user_prompt)
        acuity_level = max(vitals_level, llm_level)
        # dict.fromkeys dedupes while keeping the original order, in case the
        # LLM happens to echo a reason already caught by the vitals check.
        acuity_reasons = list(dict.fromkeys(vitals_reasons + llm_reasons))[:5]
    else:
        llm = _get_llm()
        completion = llm.invoke(
            [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ]
        )
        guidance = completion.content

    response_time_ms = int((time.monotonic() - started) * 1000)

    # The latency Express measures includes this plus HTTP overhead; logging
    # it here is what separates "the model was slow" from "the network was".
    logger.info(
        "consult: completed in %dms (model=%s, acuity=%s)",
        response_time_ms,
        LLM_MODEL,
        ACUITY_LEVEL_NAMES[acuity_level] if acuity_level is not None else "n/a",
    )

    return {
        "diagnosticGuidance": guidance,
        # Every retrieved passage is returned, including the ones filtered out
        # of the prompt — a loosely-related hit is still worth showing, and
        # hiding it would make the retrieval impossible to reason about from
        # the outside. `grounded` is what keeps that honest: it says whether
        # this passage was actually in front of the model when it answered.
        # Without it the UI shows a 0.05-scoring passage the model never saw
        # as though it were the source the answer came from, which in a
        # clinical tool is a claim the system cannot support.
        "sources": [
            {
                "title": doc.metadata.get("title", "Untitled"),
                "excerpt": doc.page_content[:280],
                "score": round(float(score), 4),
                "grounded": score >= MIN_RELEVANCE_SCORE,
            }
            for doc, score in results
        ],
        "disclaimer": DISCLAIMER,
        "ragMetadata": {
            "model": LLM_MODEL,
            "retrievalCount": len(results),
            "responseTimeMs": response_time_ms,
        },
        "acuityLevel": ACUITY_LEVEL_NAMES[acuity_level] if acuity_level is not None else None,
        "acuityReasons": acuity_reasons or None,
    }
