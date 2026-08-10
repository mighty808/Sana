import os

from dotenv import load_dotenv

# Must run BEFORE importing rag.pipeline — that module reads GROQ_MODEL at
# import time and rag.pipeline's ChatGroq client reads GROQ_API_KEY from
# the environment when it's first constructed.
load_dotenv()

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from rag.pipeline import consult as run_rag_pipeline

app = FastAPI(title="MediAssist AI", version="0.1.0")

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


class ConsultRequest(BaseModel):
    query: str
    patientContext: PatientContext | None = None


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


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/v1/consult", response_model=ConsultResponse)
def consult(req: ConsultRequest):
    if not os.getenv("GROQ_API_KEY"):
        # Fails loudly and immediately rather than letting the LLM client
        # throw a less obvious auth error later — Express's ai.service.ts
        # treats ANY non-2xx response here as "AI service unavailable" and
        # degrades gracefully, so this doesn't take down the hospital
        # system, but the real cause should be easy to spot in these logs.
        raise HTTPException(status_code=503, detail="GROQ_API_KEY is not configured")

    patient_context = req.patientContext.model_dump() if req.patientContext else {}

    try:
        result = run_rag_pipeline(req.query, patient_context)
    except Exception as exc:  # noqa: BLE001 — deliberately broad: any pipeline
        # failure (embedding model load error, Groq API error, vector store
        # issue) should surface as a clean 503 to Express, not a raw 500
        # with an internal stack trace leaking to the client.
        raise HTTPException(status_code=503, detail=f"RAG pipeline error: {exc}") from exc

    return result
