# Sana

Intelligent event-driven hospital management system with an AI-powered diagnostic decision-support agent (Sana AI).

Final-year project — Paakwesi Effah Aboagye, BSc Computer Science, University of Ghana.

## Stack

- **Client**: React + TypeScript + Vite, Tailwind CSS + shadcn/ui, Framer Motion, React Router, React Hook Form + Zod, TanStack Query, Recharts, Socket.IO client
- **Server**: Node.js + Express + TypeScript, MongoDB + Mongoose, Socket.IO, JWT + Argon2id, Zod, Swagger
- **AI Service**: Python + FastAPI, LangChain, ChromaDB, local sentence-transformers embeddings, Groq-hosted LLM

## Running locally

```bash
# Terminal 1 — MongoDB
mongod

# Terminal 2 — Backend
cd server
npm install
npm run dev

# Terminal 3 — Frontend
cd client
npm install
npm run dev

# Terminal 4 — AI Service
cd ai-service
python -m venv venv
./venv/Scripts/pip install -r requirements.txt   # ~2GB (torch + transformers) — first install is slow
./venv/Scripts/python -m uvicorn main:app --port 8000
```

The AI service needs `ai-service/.env` with a `GROQ_API_KEY` (get one free at
console.groq.com) — copy the relevant lines from `.env.example`. On its
**first** `/v1/consult` request, it downloads a small (~80MB) local embedding
model from Hugging Face and seeds the vector store from
`rag/knowledge_base.py` — this needs a working internet connection once, and
is cached afterward (`ai-service/chroma_db/`, gitignored). If that first
request hangs or fails, it's almost always a DNS/network hiccup reaching
`huggingface.co`, not a code issue — retry once your connection is stable.

| Service | URL |
|---|---|
| Frontend | http://localhost:5173 |
| Backend | http://localhost:3000 |
| Swagger | http://localhost:3000/api/docs |
| Sana AI | http://localhost:8000 |
| MongoDB | localhost:27017 |

`GET /health` on the AI service is a **readiness** check, not just a liveness
one: it reports 503 until the Groq key is configured and the vector store has
passages in it, and names which check failed. The first call is slow, because
it is the one that loads the embedding model.

## Testing

```bash
# Backend — Jest, in-memory MongoDB, no external services
cd server && npm test

# Frontend — Playwright against an ephemeral DB and real servers
cd client && npm run test:e2e           # chromium; :mobile, :visual, :edge also exist

# AI service — pytest. Everything except test_retrieval.py runs offline with
# no API key; test_retrieval.py loads the real embedding model and store.
cd ai-service && ./venv/Scripts/python -m pytest -q
```

### Evaluating the RAG pipeline

Retrieval quality is measured, not eyeballed. `rag/eval_data.py` holds a
labelled query set — questions the knowledge base covers, paired with the
entries that should come back, plus questions it deliberately does not cover.

```bash
# Retrieval metrics: hit-rate@5, MRR, grounded rate, refusal rate.
# No LLM call, so this is deterministic, free, and runs in CI.
cd ai-service && ./venv/Scripts/python -m pytest tests/test_retrieval.py -q -s

# Generation quality: calls the real LLM, so it needs GROQ_API_KEY and is
# local-only. Save a run before a change and diff it against one after.
./venv/Scripts/python -m rag.eval > before.txt
```

### The service contract

`/v1/consult`'s response shape is restated by hand in six places across three
languages. `contract/consult-response.schema.json` is generated from the
Pydantic models and asserted from both sides — `ai-service/tests/test_contract.py`
and `server/src/test/ai-contract.test.ts` — so a drift fails a test instead of
reaching production. After changing a model in `ai-service/main.py`:

```bash
cd ai-service && ./venv/Scripts/python generate_contract.py   # then commit the result
```

## Build plan

See task list — 11 phases, foundation through AI integration to final report. Core hospital platform (phases 1–7) ships before Sana AI integration (phase 8).
