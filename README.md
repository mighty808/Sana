# Sana

Intelligent event-driven hospital management system with an AI-powered diagnostic decision-support agent (MediAssist AI).

Final-year project — Paakwesi Effah Aboagye, BSc Computer Science, University of Ghana.

## Stack

- **Client**: React + TypeScript + Vite, Tailwind CSS + shadcn/ui, Framer Motion, React Router, React Hook Form + Zod, TanStack Query, Recharts, Socket.IO client
- **Server**: Node.js + Express + TypeScript, MongoDB + Mongoose, Socket.IO, JWT + Argon2id, Zod, Swagger
- **AI Service**: Python + FastAPI, LangChain, Groq/Llama 3, Pinecone/ChromaDB

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
| MediAssist AI | http://localhost:8000 |
| MongoDB | localhost:27017 |

## Build plan

See task list — 11 phases, foundation through AI integration to final report. Core hospital platform (phases 1–7) ships before MediAssist AI integration (phase 8).
