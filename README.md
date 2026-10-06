# Sana

A hospital management system with a retrieval-grounded AI
diagnostic decision-support agent.

Final-year project — Paakwesi Effah Aboagye, BSc Computer Science, University
of Ghana.

Sana covers the clinical workflow end to end: patient registration,
appointments, encounters, lab orders and results, prescriptions and dispensing,
doctor-to-doctor referrals, and billing. Two things separate it from a CRUD
admin system — an AI agent that answers clinical questions grounded in a
medical knowledge base and independently triages patient acuity from recorded
vitals, and a real-time layer that pushes notifications, ward-board updates and
referral messages as they happen rather than on a refresh.

---

## Contents

- [Architecture](#architecture)
- [Roles and permissions](#roles-and-permissions)
- [Running locally](#running-locally)
- [Sana AI](#sana-ai)
- [Security](#security)
- [Testing](#testing)
- [Evaluating retrieval](#evaluating-retrieval)
- [Continuous integration](#continuous-integration)
- [Deployment](#deployment)
- [Project layout](#project-layout)
- [Known gaps](#known-gaps)

---

## Architecture

Three processes, talking over HTTP and WebSockets.

| Tier | Stack | Responsibility |
|---|---|---|
| **Client** | React 19, TypeScript, Vite, Tailwind v4, shadcn/ui, TanStack Query, React Hook Form + Zod, Recharts, Socket.IO client | 22 pages across six role-specific interfaces |
| **Server** | Node.js, Express, TypeScript, MongoDB + Mongoose, Socket.IO, JWT + Argon2id, Zod, Swagger | Business rules, persistence, authorisation, real-time push |
| **AI service** | Python, FastAPI, LangChain, ChromaDB, local ONNX (fastembed) embeddings, Groq-hosted LLM | Retrieval-augmented generation and acuity assessment |

**The AI service is a separate process, not a library inside the backend.**
That keeps the Python ML stack — onnxruntime, fastembed, chromadb — out
of the Node runtime, lets the two be deployed and scaled independently, and
means an AI outage degrades one feature instead of taking the hospital system
down with it. Every call to it is bounded by a 20-second timeout and collapses
to a clean 503, which the UI shows as "continue manually".

### Design decisions worth knowing

**Access control lives in queries, not `if` statements.** Ownership is
expressed as a query filter — `findOne({ _id, doctor: doctorId })` — rather
than a comparison after fetching. A mismatch then returns 404 instead of 403,
so a user cannot learn that a record exists by being told they may not see it.

**One collection per sub-record.** Vitals, diagnoses, referrals, prescriptions
and lab orders each reference the encounter rather than being embedded arrays
on it. Each legitimately repeats and each needs its own identity, timestamps
and access rules.

**Money is computed server-side.** Invoice creation accepts line items with
quantity and unit price but no total — the server derives it, so a caller
cannot submit a figure its own items don't support. Payments run inside a real
MongoDB transaction, recomputing amount paid, balance and status atomically, so
two concurrent payments cannot both read a stale balance.

**Notifications never break the thing that triggered them.** A single
`notify()` writes the record and pushes it over Socket.IO, and it never throws:
a notification is a side effect of something that already succeeded, so a
failure there must not turn a completed booking into an error.

---

## Roles and permissions

Six roles, mirroring real hospital division of labour rather than seniority
tiers.

| Role | Owns |
|---|---|
| **Nurse** | Intake — registers patients, books appointments, opens encounters, records vitals |
| **Doctor** | Continues the encounter — diagnoses, prescribes, orders labs, refers, queries Sana AI |
| **Lab Technician** | The lab workflow end to end, entering *and* releasing results |
| **Pharmacist** | The prescription queue and dispensing |
| **Patient** | Their own records only |
| **Admin** | Oversight — users, billing, audit log, hospital-wide analytics; read-only clinically |

A doctor deliberately *cannot* register a patient or book an appointment: those
are front-desk actions. Admin deliberately cannot enter or release a lab
result: oversight is read-only, so nobody outside the lab authors clinical
data.

**`server/src/types/permissions.ts` is the single source of truth** — 39
permissions across the six roles. Every protected route calls
`requirePermission()`. The client mirrors the list to hide navigation and guard
routes, but that copy is cosmetic: a user who forces their way to a hidden page
meets a server that refuses independently.

Granularity is deliberate. `analytics.read` (every role, own dashboard) is
separate from `analytics.readTrends` (Admin only, hospital-wide revenue and
volume); folding them together would expose hospital finances to every login.
`notification.readAll` exists for the same reason.

---

## Running locally

**Prerequisites:** Node 22+, Python 3.13, MongoDB running locally.

```bash
# Terminal 1 — MongoDB
mongod

# Terminal 2 — Backend
cd server
npm install
npm run seed          # roles + the six named role accounts
npm run dev

# Terminal 3 — Frontend
cd client
npm install
npm run dev

# Terminal 4 — AI service
cd ai-service
python -m venv venv
./venv/Scripts/pip install -r requirements.txt   # no torch — a few hundred MB, quick
./venv/Scripts/python -m uvicorn main:app --port 8000
```

| Service | URL |
|---|---|
| Frontend | http://localhost:5173 |
| Backend | http://localhost:3000 |
| Swagger | http://localhost:3000/api/docs |
| Sana AI | http://localhost:8000 |
| MongoDB | localhost:27017 |

### Configuration

Copy the relevant blocks from `.env.example` into `server/.env` and
`ai-service/.env`. Neither file is committed.

The AI service needs a `GROQ_API_KEY` — free at console.groq.com. Without it
the service starts but `/v1/consult` returns 503 and `/health` reports
unavailable.

`AI_SERVICE_TOKEN` is an optional shared secret between the backend and the AI
service. Leave both blank locally and the endpoint stays open; set both before
exposing the AI service beyond localhost. Setting only one side fails closed.

### First run

On its first request the AI service downloads a ~90MB ONNX embedding model from
Hugging Face and seeds the vector store from `rag/knowledge_base.py`. That
needs one working internet connection and is cached afterwards in
`ai-service/chroma_db/` (gitignored). A hang or failure on that first call is
almost always a network hiccup reaching `huggingface.co` rather than a code
problem.

Editing `rag/knowledge_base.py` later takes effect on the next start: the store
holds a fingerprint of its contents and re-seeds when it no longer matches.

`GET /health` on the AI service is a **readiness** check, not a liveness one —
it returns 503 until the Groq key is configured and the vector store has
passages, and names which check failed. The first call is slow because it is
the one that loads the model.

---

## Sana AI

One endpoint, `POST /v1/consult`, does the work:

1. The question is embedded with a **local** MiniLM model run through ONNX — no
   API key, no per-call cost.
2. That embedding searches a **ChromaDB** store of 42 condition summaries based
   on the Ghana Standard Treatment Guidelines.
3. Passages below a relevance threshold are **excluded from the prompt**, so a
   weak match cannot masquerade as grounding.
4. Retrieved passages plus anonymised patient context form the prompt.
5. A **Groq-hosted LLM** (temperature 0.2) generates the answer.
6. The response carries guidance, cited sources with relevance scores and a
   `grounded` flag, a disclaimer, and retrieval metadata.

**The privacy boundary is the most important property here.** Only chief
complaint, recent vitals and free-text symptoms ever leave the building —
never name, patient number, phone or email. The language model is third-party
hosted, so identifiable data must not reach it. Anonymisation is enforced in
`server/src/services/ai.service.ts`'s `buildAnonymizedContext`, and the Python
side ignores any field it does not recognise as a second line of defence.

**Acuity assessment** runs when `assessAcuity` is set — the nurse's vitals
analysis. A deterministic threshold check on the vitals is combined with the
model's own read by taking whichever is *more* severe, so a hard vitals breach
can never be softened by a milder LLM answer. If the model's structured
response fails to parse, the result falls back to **URGENT**, not STABLE:
failing toward attention rather than silence. A CRITICAL result escalates to
the patient's doctor and colours the ward board.

---

## Security

- **Argon2id** password hashing — memory-hard, not bcrypt.
- **Split tokens.** A 15-minute access token held only in a JavaScript
  variable — never `localStorage`, so XSS cannot read it — plus a long-lived
  refresh token in an **httpOnly** cookie. The app refreshes silently on load.
- **Logout and password change bump a token version**, invalidating every
  outstanding refresh token for that account at once.
- **Rate limiting** on login and password reset. The test-only disable flag is
  gated on `NODE_ENV !== 'production'`, so it cannot be switched on where it
  matters.
- **Password reset does not leak account existence** — the same response
  whether or not the address is registered.
- **Audit log** over 20+ action types, with actor and IP.
- **Socket auth re-fetches the user** rather than trusting a role claim inside
  the token, so a permission change takes effect immediately.

---

## Testing

Three layers. Each tests something the others structurally cannot.

| Layer | Tests | Runs against | Answers |
|---|---|---|---|
| Jest (backend) | 272 in 24 suites | In-memory MongoDB | Do the business rules hold? |
| Playwright (e2e) | 77 in 20 specs | Ephemeral DB + real servers | Does the workflow work per role? |
| pytest (ai-service) | 93 in 7 files | Mostly offline, no API key | Is the pipeline correct? |
| axe (accessibility) | 20 pages | Signed in per role | Is it usable assistively? |

```bash
# Backend — in-memory MongoDB, no external services
cd server && npm test

# Frontend — Playwright against an ephemeral DB and real servers
cd client && npm run test:e2e          # chromium
                                       # :mobile, :visual, :edge, :headed also exist

# AI service — everything except test_retrieval.py runs offline with no API key
cd ai-service && ./venv/Scripts/python -m pytest -q
```

Every Playwright run boots an **ephemeral in-memory MongoDB plus the real
Express and Vite servers**, seeded with the six role accounts and five
deterministic patients. It never touches a real database.

Four decisions in that suite are worth defending:

- **Dedicated ports (4100/5273) and `reuseExistingServer: false`.** Not a perf
  knob — without it Playwright attaches to whatever is already listening, and
  if a developer has the real dev server running, a suite that writes data
  would write to the real database. Forcing a fresh spawn makes a port clash
  fail loudly instead.
- **Unique tagging.** All specs share one database and run in parallel, so
  every fixture stamps a random tag into a visible field and each test finds
  *its own* row — never "the first row", never a global count.
- **The permission matrix reads its own answers.** Expectations are derived
  from each role's actual permission list at runtime, so the matrix cannot go
  stale when permissions change.
- **`color-contrast` is enforced, not excluded.** It caught two real defects
  that eye review had passed.

---

## Evaluating retrieval

Retrieval quality is measured rather than eyeballed. `rag/eval_data.py` holds a
labelled set: 25 questions the knowledge base covers paired with the entries
that should come back, plus 8 it deliberately does not cover.

```bash
# Retrieval metrics — no LLM call, so deterministic, free, and CI-safe
cd ai-service && ./venv/Scripts/python -m pytest tests/test_retrieval.py -q -s

# Generation quality — calls the real LLM, needs GROQ_API_KEY, local only.
# Save a run before a change and diff it against one after.
./venv/Scripts/python -m rag.eval > before.txt
```

Measured baseline: **hit-rate@5 1.000, MRR 0.933, refusal rate 1.000, grounded
rate 0.880.**

That last figure is a real limitation, documented rather than hidden. Three
in-knowledge-base questions retrieve the right document but score below the
relevance threshold, so the model is told nothing relevant was found — among
them a stroke presentation and a UTI that collides lexically with "Burns". The
threshold cannot simply be lowered: the score distributions overlap, with
out-of-scope questions reaching 0.167, above two of those three. Embedding
titles alongside the text was tried as a fix and measured *worse* (hit-rate
1.000 → 0.960), because every title shares a "Ghana STG" prefix that dilutes
the distinctive content. `test_known_false_refusals` pins the count so it
cannot grow unnoticed.

---

## Continuous integration

`.github/workflows/e2e.yml` runs two jobs in parallel on every push and pull
request:

- **`ai-service`** — pytest on Python 3.13, with the embedding model cached so
  a run doesn't re-download ~90MB. No `GROQ_API_KEY` is configured, by design:
  the suite is built to run without one, which means no secret to leak, no API
  spend per push, and no LLM non-determinism deciding whether a build passes.
- **`e2e`** — type-checks both halves, runs the backend suite, then the
  Playwright chromium project. Visual and mobile projects stay opt-in; they
  would add minutes per push for little extra signal, and visual baselines are
  platform-specific (a Windows screenshot never matches CI's Linux).

---

## Deployment

Client on Vercel, server and ai-service on Render, as two separate Render
services — not all three on one platform. The reason is Socket.IO: the
real-time notification layer (Section "Architecture" above) needs a
persistent connection, which Vercel's serverless functions can't hold open.
Render runs the server as a normal long-lived process instead.

Splitting client and server onto different origins means neither can rely on
"same origin" the way local development does — see `VITE_API_URL` /
`VITE_SOCKET_URL` in `client/src/lib/api.ts` and `socket.ts`, and the
production-only `sameSite: 'none'` on the refresh-token cookie in
`server/src/controllers/auth.controller.ts`.

### 1. Server + ai-service (Render)

1. Push this repo to GitHub if it isn't already.
2. At [dashboard.render.com/blueprints](https://dashboard.render.com/blueprints),
   choose **New Blueprint Instance** and point it at this repo. Render reads
   `render.yaml` at the repo root and provisions both `sana-server` and
   `sana-ai-service`.
3. Render will prompt for the env vars marked `sync: false` in `render.yaml`:
   - `sana-server`: `CLIENT_URL` (the Vercel URL from step 2 below — you can
     come back and set this after Vercel gives you a domain), `MONGO_URI`
     (your Atlas connection string), `AI_SERVICE_TOKEN` (any random string —
     it just has to match the same var on `sana-ai-service`).
   - `sana-ai-service`: `GROQ_API_KEY` (from console.groq.com), and the same
     `AI_SERVICE_TOKEN` value as above.
4. `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` are auto-generated by the
   blueprint (`generateValue: true`) — you don't need to set these yourself.
5. Note `sana-server`'s public URL once deployed
   (`https://sana-server-xxxx.onrender.com`) — the client needs it next.

### 2. Client (Vercel)

1. Import this repo at [vercel.com/new](https://vercel.com/new), and set the
   **Root Directory** to `client` (Vercel should auto-detect the Vite
   framework preset once you do).
2. Add two environment variables in the Vercel project settings:
   - `VITE_API_URL` = `https://sana-server-xxxx.onrender.com/api/v1`
   - `VITE_SOCKET_URL` = `https://sana-server-xxxx.onrender.com`
     (same host as above, no path)
3. Deploy. Vercel gives you a URL like `https://sana.vercel.app`.
4. Go back to the `sana-server` service on Render and set `CLIENT_URL` to
   that exact Vercel URL (this drives both the Express CORS allowlist and the
   Socket.IO CORS allowlist — see `server/src/app.ts` and
   `server/src/config/socket.ts`), then redeploy `sana-server` so it picks up
   the new value.

### 3. Seed production data (optional)

The seed script (`server/src/utils/seed.ts`) is meant for local development —
it creates the demonstration accounts documented in `TEST_LOGINS.md`, all
sharing one password. Running it against your production `MONGO_URI` is fine
for a thesis demo, but don't do this against a database with anything else in
it.

### Known limitation of this setup

Render's free tier spins containers down after a period of inactivity. A cold
start on `sana-ai-service` has to reload the embedding model and rebuild the
vector store, which is noticeably slower than a warm request. If you're
demoing live (e.g. a thesis defense), send a request to `sana-ai-service`'s
`/health` a few minutes beforehand to warm it up, or upgrade that one service
to a paid tier for the day.

---

## Project layout

```
client/          React app — 22 pages, feature-first structure
  src/features/  One folder per feature: api hooks + pages together
  e2e/           20 Playwright specs, fixtures, visual baselines
server/          Express API — 17 models, 16 services, 16 route modules
  src/types/permissions.ts    single source of truth for authorisation
  src/test/      24 Jest suites
ai-service/      FastAPI + RAG
  rag/knowledge_base.py       42 Ghana STG condition summaries
  rag/pipeline.py             retrieval, prompting, acuity
  rag/eval_data.py            labelled query set for the retrieval metrics
```

---

## Known gaps

Stated plainly rather than left to be discovered.

- **The AI service's own HTTP contract is unverified.** The backend mocks the
  call and the e2e harness stubs it, so a response-shape change on the Python
  side would break the feature with every test still green. A contract check
  existed and was removed; the mock in `server/src/test/mockAi.ts` and the stub
  in `e2eServer.ts` now mirror the real shape by hand.
- **Seeded accounts share one password**, acceptable only because the seeded
  database is for development. The credentials file is gitignored.
- **Visual baselines are platform-specific** — CI must generate its own.
- **Single-hospital scope** — no multi-tenancy, no inter-facility transfer.
- **The overpayment validation message is unreachable.** The payment input's
  `max` attribute lets native browser validation block submission before the
  form library runs. The guard holds; only the wording is dead code.
