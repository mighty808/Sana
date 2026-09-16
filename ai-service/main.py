import os

from dotenv import load_dotenv

# This has to run before rag.pipeline is imported below. That module reads
# the GROQ_MODEL environment variable as soon as it's imported, and its
# ChatGroq client reads GROQ_API_KEY from the environment as soon as it's
# created. Both need the .env file already loaded by then.
load_dotenv()

import logging
import secrets

from fastapi import Depends, FastAPI, Header, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from rag.pipeline import consult as run_rag_pipeline
from rag.pipeline import _get_vectorstore as get_vectorstore

logger = logging.getLogger("sana.api")

app = FastAPI(title="Sana AI", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# A shared secret between Express and this service. Anything that can reach
# port 8000 can otherwise query the pipeline and spend the Groq quota — the
# service has no other access control, because it was written on the
# assumption that only the backend would ever call it.
#
# Enforced only when the variable is set, deliberately. This follows the same
# pattern as server/src/middleware/rateLimiter.ts's E2E_DISABLE_RATE_LIMIT: a
# developer running the service locally should not have to configure a secret
# before anything works, but a deployment that sets one gets it enforced with
# no code change. The startup warning below is what stops "unset" from being a
# silent default nobody notices in production.
AI_SERVICE_TOKEN = os.getenv("AI_SERVICE_TOKEN")

if not AI_SERVICE_TOKEN:
    logger.warning(
        "AI_SERVICE_TOKEN is not set — /v1/consult is unauthenticated. "
        "Set it (and the matching value in the Express server's environment) "
        "before exposing this service beyond localhost."
    )


def require_service_token(x_sana_token: str | None = Header(default=None)) -> None:
    """
    Rejects a consult request that doesn't carry the shared secret.

    401 rather than 403: the caller has presented no valid credential at all,
    which is what 401 means. Express turns any non-2xx from here into its own
    "Sana AI is currently unavailable", so a misconfigured token surfaces to
    the user the same way an outage does — the distinction lives in the logs,
    which is why the failure is logged here with the reason.
    """
    if not AI_SERVICE_TOKEN:
        return
    # compare_digest rather than `!=`: a plain string comparison returns as
    # soon as two bytes differ, so how long it takes leaks how much of the
    # token was guessed correctly. The constant-time comparison removes that
    # signal. It requires both operands to be str, hence the empty-string
    # fallback for a request that sent no header at all.
    if not secrets.compare_digest(x_sana_token or "", AI_SERVICE_TOKEN):
        logger.warning("Rejected a /v1/consult request with a missing or incorrect X-Sana-Token")
        raise HTTPException(status_code=401, detail="Invalid or missing service token")


class PatientContext(BaseModel):
    chiefComplaint: str | None = None
    vitals: dict | None = None
    symptoms: list[str] | None = None
    # Only set for a Lab Tech's "explain result" request. It holds the
    # test's own fields (name, value, unit, reference range,
    # interpretation), and is never sent together with chiefComplaint or vitals.
    testResult: dict | None = None


class ConsultRequest(BaseModel):
    query: str
    patientContext: PatientContext | None = None
    # Only set true by the nurse's "AI Analysis" button (see
    # ai.service.ts's analyzeVitalsForNurse). When true, the pipeline also
    # works out an acuityLevel/acuityReasons triage read from the vitals
    # and the retrieved knowledge base, on top of the usual guidance text.
    assessAcuity: bool = False


class Source(BaseModel):
    title: str
    excerpt: str
    score: float
    # Whether this passage cleared MIN_RELEVANCE_SCORE and was therefore
    # actually given to the model as grounding, as opposed to merely being
    # among the nearest matches. Defaults to False so a response produced by
    # an older build of the pipeline — or a stored consultation being
    # re-validated — is treated as "not known to be grounded" rather than
    # silently claiming it was.
    grounded: bool = False


class RagMetadata(BaseModel):
    model: str | None = None
    retrievalCount: int | None = None
    responseTimeMs: int | None = None


class ConsultResponse(BaseModel):
    diagnosticGuidance: str
    sources: list[Source]
    disclaimer: str
    ragMetadata: RagMetadata
    # Only set when the request had assessAcuity=True.
    acuityLevel: str | None = None
    acuityReasons: list[str] | None = None


@app.get("/health")
def health(response: Response):
    """
    Readiness, not just liveness.

    This used to return {"status": "ok"} unconditionally, without touching
    anything — so the service reported healthy right up until the first real
    request failed, which is the opposite of what a health check is for. The
    two things that actually have to be true before /v1/consult can work are
    checked here instead: the Groq key is configured, and the vector store has
    passages in it.

    Reports 503 rather than 200 when either is false, so an orchestrator or a
    person reading the endpoint gets the same answer. The body always lists
    both checks, because "which one is broken" is the useful part — a bare
    "unhealthy" sends you reading logs for something the response already knew.

    Deliberately cheap on the happy path: the vector store is memoized after
    the first call (rag.pipeline._get_vectorstore), so repeated polling costs a
    count query rather than an embedding-model load. The FIRST call, though,
    can take tens of seconds while that ~80MB model loads — which is a feature
    for a readiness probe, since the service genuinely isn't ready until then.
    """
    checks = {"groqApiKey": bool(os.getenv("GROQ_API_KEY")), "vectorStore": False}
    passage_count = 0

    try:
        passage_count = get_vectorstore()._collection.count()
        checks["vectorStore"] = passage_count > 0
    except Exception:  # noqa: BLE001 — a health check must report a failure,
        # never become one. Any error loading the embedding model or opening
        # the store leaves vectorStore False and is logged for diagnosis.
        logger.exception("Health check could not reach the vector store")

    ready = all(checks.values())
    if not ready:
        response.status_code = 503

    return {"status": "ok" if ready else "unavailable", "checks": checks, "passages": passage_count}


@app.post("/v1/consult", response_model=ConsultResponse, dependencies=[Depends(require_service_token)])
def consult(req: ConsultRequest):
    if not os.getenv("GROQ_API_KEY"):
        # This fails loudly and immediately, instead of letting the LLM
        # client throw a more confusing authentication error further down
        # the line. The Express backend's ai.service.ts treats any
        # non-2xx response from here as "AI service unavailable" and
        # degrades gracefully, so a missing key here doesn't take down the
        # rest of the hospital system. But the real cause should still be
        # easy to spot by checking these logs.
        raise HTTPException(status_code=503, detail="GROQ_API_KEY is not configured")

    patient_context = req.patientContext.model_dump() if req.patientContext else {}

    try:
        result = run_rag_pipeline(req.query, patient_context, req.assessAcuity)
    except Exception as exc:  # noqa: BLE001 — this catches any exception on
        # purpose. Any failure in the pipeline (the embedding model failing
        # to load, a Groq API error, a vector store problem) should reach
        # Express as a clean 503, not as a raw 500 error that leaks an
        # internal stack trace to the client.
        raise HTTPException(status_code=503, detail=f"RAG pipeline error: {exc}") from exc

    return result
