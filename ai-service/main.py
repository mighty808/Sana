import os

from dotenv import load_dotenv

# This has to run before rag.pipeline is imported below. That module reads
# the GROQ_MODEL environment variable as soon as it's imported, and its
# ChatGroq client reads GROQ_API_KEY from the environment as soon as it's
# created. Both need the .env file already loaded by then.
load_dotenv()

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from rag.pipeline import consult as run_rag_pipeline

app = FastAPI(title="Sana AI", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


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
def health():
    return {"status": "ok"}


@app.post("/v1/consult", response_model=ConsultResponse)
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
