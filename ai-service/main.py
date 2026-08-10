from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

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


class ConsultResponse(BaseModel):
    diagnosticGuidance: str
    sources: list[Source]
    disclaimer: str


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/v1/consult", response_model=ConsultResponse)
def consult(_req: ConsultRequest):
    # RAG pipeline lands here in Phase 8: embed query -> vector search -> LangChain prompt -> Groq/Llama 3
    raise NotImplementedError("RAG pipeline not yet implemented")
