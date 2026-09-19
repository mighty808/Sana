# Sana — Project Brief

> A complete technical reference for **Sana**, an event-driven hospital management
> system with an AI-powered diagnostic decision-support agent.
>
> Final-year project — Paakwesi Effah Aboagye, BSc Computer Science, University of Ghana.
>
> **Purpose of this document:** to carry the full context of the project into a
> fresh conversation (e.g. for thesis writing), including not just *what* was
> built but *why* each significant decision was made. The reasoning is the part
> that isn't recoverable from the code alone.

---

## 1. What the system is

Sana is a hospital management system covering the full clinical workflow —
patient registration, appointments, clinical encounters, lab orders and results,
prescriptions and dispensing, referrals between doctors, and billing — with two
things that distinguish it from a CRUD admin system:

1. **An AI diagnostic decision-support agent ("Sana AI")** — a retrieval-augmented
   generation (RAG) service that answers a doctor's clinical questions grounded
   in a medical knowledge base, and independently triages patient acuity from
   vitals.
2. **Event-driven real-time behaviour** — Socket.IO pushes notifications, ward
   board updates and referral messages live, rather than requiring a refresh.

### Three-tier architecture

| Tier | Technology | Responsibility |
|---|---|---|
| **Client** | React 19, TypeScript, Vite, Tailwind v4, shadcn/ui, TanStack Query, React Router, React Hook Form + Zod, Recharts, Framer Motion, Socket.IO client | All six role-specific UIs |
| **Server** | Node.js, Express, TypeScript, MongoDB + Mongoose, Socket.IO, JWT + Argon2id, Zod, Swagger | Business rules, persistence, authorisation, real-time push |
| **AI Service** | Python, FastAPI, LangChain, ChromaDB, HuggingFace embeddings, Groq-hosted LLM | RAG pipeline and acuity assessment |

The AI service is a **separate process reached over plain HTTP**, not a library
inside the backend. This keeps the Python ML stack (torch, sentence-transformers,
chromadb) out of the Node runtime, lets the two be deployed and scaled
independently, and means an AI outage degrades one feature rather than taking
down the hospital system.

---

## 2. Scale

| Measure | Count |
|---|---|
| Mongoose models | 17 |
| Service modules | 16 |
| Route modules | 16 |
| Permissions | 39 |
| Roles | 6 |
| Client pages | 22 |
| Backend test suites | 24 (270 tests) |
| End-to-end spec files | 20 (77 tests) |

---

## 3. Roles and the permission model

Six roles: **Admin, Doctor, Nurse, Patient, Lab Technician, Pharmacist.**

The design principle is that **roles mirror real hospital division of labour**
rather than being tiers of seniority:

- **Nurse** is the front desk and intake: registers patients, books appointments,
  opens encounters, records vitals. A doctor *cannot* do these — they're
  check-in actions.
- **Doctor** continues an encounter a nurse opened: diagnoses, prescribes, orders
  labs, refers to colleagues, and is the only role that can query Sana AI freely.
- **Lab Technician** owns the whole lab workflow — entering *and* releasing
  results. Admin has read-only oversight and deliberately cannot do either.
- **Pharmacist** works the prescription queue and dispenses.
- **Patient** sees only their own records.
- **Admin** supervises: user management, billing, audit log, hospital-wide
  analytics, and read-only clinical visibility.

### Authorisation is enforced server-side; the client only mirrors it

`server/src/types/permissions.ts` is the single source of truth — a `PERMISSIONS`
list and a `DEFAULT_ROLE_PERMISSIONS` map. Every protected route calls
`requirePermission('...')`. The client has a matching `Permission` union and uses
it to hide nav items and guard routes, but **that is purely cosmetic**: a user who
forged their way to a hidden page still hits a server that independently refuses
the request.

This mirroring is deliberate and is called out in `ProtectedRoute.tsx`'s own
comments — the client check exists so a user never sees a link leading somewhere
they'd be rejected, not as a security boundary.

Granularity was chosen to avoid over-broad grants. For example `analytics.read`
(every role, for their own small dashboard) is separate from
`analytics.readTrends` (Admin only, hospital-wide revenue and volume) — folding
them together would have exposed hospital finances to every login. The same
reasoning later produced `notification.readAll` for Admin's oversight feed,
separate from everyone's personal `notification.read`.

---

## 4. Domain model and notable design decisions

### One collection per sub-record

`Encounter` is the spine of a clinical visit. `VitalSign`, `Diagnosis`,
`Referral`, `Prescription` and `LabOrder` are each **their own collection**
referencing the encounter, rather than embedded arrays. An encounter legitimately
has several diagnoses or several vitals readings over time, and each needs its own
identity, timestamps and access rules.

### Referrals, and why messages became a separate collection

A `Referral` carries `{ encounter, patient, fromDoctor, toDoctor, reason, notes?, status }`.
It is the one sub-record that must surface to someone *not already looking at that
encounter*, which is why it carries both doctors and is indexed on
`{ toDoctor, status }`.

`ReferralMessage` is a separate collection rather than an array on the referral:
messages are appended indefinitely, are never edited, need their own sender and
timestamp, and are queried as "the whole thread, oldest first" — indexed on
`{ referral, createdAt }`.

### Prescriptions dispense atomically

A `Prescription` holds its whole medication list with **one status**, not
per-medication state, because a prescription is handed over as a unit.
`dispensePrescription` only accepts a `PRESCRIBED` one, so a second attempt
returns 409 rather than double-dispensing.

### Money is computed server-side

`createInvoice` accepts line items with `qty` and `unitPrice` but **no total** —
the server computes it, so a caller can't submit a total that doesn't match its
items. An invoice bills exactly one thing: the schema requires exactly one of
`labOrder` or `prescription`.

`recordPayment` runs inside a real MongoDB **transaction**, recomputing
`amountPaid`/`balance`/`status` in one atomic operation so two concurrent payments
can't both read a stale balance. (This is the sole reason the test harness needs a
replica set rather than a standalone mongod — transactions are rejected on a
standalone.)

### Access control lives in queries, not in `if` statements

Ownership checks are expressed as query filters rather than post-fetch
comparisons — e.g. `Encounter.findOne({ _id, doctor: doctorId })`. A mismatch then
returns a plain 404 rather than a 403, so a user can't learn that a record exists
by being told they're not allowed to see it. `updateReferralStatus` scopes to
`toDoctor` for the same reason.

`mayReadEncounter` is the shared predicate for cross-doctor access: a doctor may
read an encounter if it's theirs, it was referred to them, or they've treated that
patient before. Admin and Nurse are unrestricted.

### Notifications

`notify()` is the single function every feature calls. It writes a `Notification`
document, then pushes over Socket.IO to the `user:{id}` room, emitting both a
specific event (`referral.created`) and a generic `notification.created` so a bell
badge can update without knowing every event type. **It never throws** — a
notification is a side effect of something that already succeeded, so a failure
here must not turn a successful booking into an error.

Admin oversight added a third emit to the `role:ADMIN` room, reusing the
role-based rooms every socket already joins on connect.

---

## 5. Sana AI — the RAG pipeline

**`POST /v1/consult`** is the only endpoint the backend calls. The pipeline:

1. The doctor's question is embedded using a **local HuggingFace
   sentence-transformers model** (~80 MB, no API key, no per-call cost).
2. That embedding searches a **ChromaDB** vector store of medical literature.
3. Passages scoring below a relevance threshold are **excluded** from what the
   model sees, so weak matches don't pad the prompt.
4. Retrieved passages plus anonymised patient context form the prompt.
5. **Groq-hosted LLM** (`temperature=0.2`, `max_tokens=700`) generates the answer.
6. The response carries `diagnosticGuidance`, `sources` (with relevance scores),
   a `disclaimer`, and `ragMetadata`.

### Patient data is anonymised before it leaves the building

`buildAnonymizedContext` sends only chief complaint, recent vitals and free-text
symptoms. **Never** name, patient number, phone or email. This is the single most
important privacy property of the system: the LLM is third-party hosted, so
identifiable data must not reach it.

### Acuity assessment

With `assessAcuity: true`, the same call also returns `acuityLevel` and
`acuityReasons` — a triage read from vitals. A `CRITICAL` result escalates to the
patient's doctor via `notify()`, and colours the Ward Board. This turns the AI from
a question-answering tool into something that surfaces deterioration nobody asked
about.

### Failure is bounded

`callAiService` uses a 20-second `AbortSignal.timeout`, and a non-OK response
becomes a clean 503 `AI_SERVICE_UNAVAILABLE`. The UI shows an
`AiUnavailableBanner` rather than breaking. Auto-consult on vitals is
fire-and-forget so it can never block the nurse's save.

---

## 6. Security

- **Argon2id** password hashing (memory-hard, not bcrypt).
- **Split tokens**: a short-lived (15 min) access token held only in a JavaScript
  variable — never `localStorage`, so XSS can't read it — plus a long-lived
  refresh token in an **httpOnly cookie**. On load the app silently refreshes.
- **Logout bumps `tokenVersion`**, invalidating every outstanding refresh token
  for that user.
- **Rate limiting** on login and password reset (10/15 min in production).
- **Password reset doesn't leak account existence** — the same confirmation shows
  whether or not the email is registered.
- **Audit log** records 20 action types (`PATIENT_REGISTERED`, `LAB_RESULT_RELEASED`,
  `PRESCRIPTION_DISPENSED`, …) with actor and IP.
- **Socket authentication re-fetches the user** rather than trusting a `role`
  claim in the token, so a permission change takes effect immediately instead of
  at token expiry.

---

## 7. Testing

### Backend — 270 tests across 24 suites (Jest + `@swc/jest`)

Runs against **`mongodb-memory-server`**, a throwaway in-memory MongoDB — never
the real database. A replica-set variant exists solely for the payment
transaction test.

The one external call in the whole backend (the AI service) is stubbed via
`jest.spyOn(global, 'fetch')`; without it, tests make real, non-deterministic
network calls — which happened once when a fire-and-forget auto-consult reached a
live AI service and crashed after teardown.

### Frontend — 77 end-to-end tests across 20 spec files (Playwright)

Every run boots an **ephemeral in-memory MongoDB plus the real Express and Vite
servers**, seeded with the six role accounts and five deterministic patients. It
never touches the real database.

Coverage: all 18 routes × 6 roles, all clinical workflows, the real-time
two-doctor referral thread, accessibility, mobile viewport, and visual regression.

**The centrepiece is `rbac.spec.ts`** — a 6 × 14 access matrix whose expected
answers are read from each role's *actual* permission list at runtime, so it can't
go stale when permissions change.

### Test-design decisions worth defending in a viva

- **Ephemeral database, not the real one.** Tests that mutate shared state are
  tests you eventually stop trusting.
- **Dedicated ports (4100/5273).** Sharing dev ports meant runs died on "port in
  use" — and worse, had the runner ever attached to the dev server, the suite
  would have been mutating real data. `reuseExistingServer: false` makes that
  impossible: it fails loudly instead.
- **Unique tagging.** All spec files share one database and run in parallel, so
  every fixture stamps a random tag into a visible field and each test finds *its
  own* row — never "the first row" or a global count.
- **Depth tests assert what unit tests cannot see** — not that a rule exists (Jest
  covers that directly) but that the UI *surfaces* it to the user.

---

## 8. Defects found by the test suite

Each of these was found by writing tests, not by using the app — useful material
for an evaluation chapter, because each has an explainable mechanism.

| Defect | Mechanism | Severity |
|---|---|---|
| Email label never associated with its input (Login, Forgot Password) | `FormControl` clones `id`/`aria-*` onto its **single child** via Radix `Slot`. The child was a `<div>` wrapping the input for an icon, so the id never reached the `<input>`. Screen readers announced the placeholder. | Accessibility |
| Filter dropdowns with no accessible name (`/encounters`, `/lab-orders`) | A `<button role="combobox">` with no label — axe rated it **critical**. | Accessibility |
| WCAG AA contrast failures across muted text | `slate-400` measured **2.47:1** on the off-white card surface; `slate-500` measured 4.48:1 — passing on white but failing on tinted surfaces. Fixed by darkening `--muted-foreground` and moving muted text to `slate-600`. | Accessibility |
| Seed script ran twice | `seed.ts` executed its CLI entry point on *import*, so importing one helper from it kicked off a second concurrent seed — duplicate-key crash. Fixed with an "is this the entry module" guard. | Correctness |
| Unreachable validation message | The payment input's `max` attribute lets **native browser validation** block submit before React Hook Form runs, so the app's own "Cannot exceed the outstanding balance" message can never render. | Minor / dead code |

### Two bugs in the tests themselves — worth discussing honestly

- **An assertion that passed while testing nothing.** A loose regex
  `/balance|exceed/i` matched the page's "Balance" *label* rather than any error
  message. It only surfaced because a *different* assertion failed and forced a
  closer look. Argues for asserting on specific, app-authored strings.
- **A race against application boot.** `ProtectedRoute` renders `null` while the
  silent token refresh resolves — during that window the URL is still the
  requested route even when a redirect is imminent. Asserting immediately after
  navigation raced it. Fixed by waiting for the app shell to mount (the real
  "routing settled" signal), not by lengthening a timeout.

---

## 9. Known gaps and limitations

- **The AI service has no automated tests.** Jest mocks `fetch`; the e2e harness
  stubs `/v1/consult` outright. So the FastAPI service and the contract between it
  and the backend are verified by nothing. A response-shape change would break the
  feature with every test still green. *This is the largest untested surface.*
- **CI is written but not yet active** (`.github/workflows/e2e.yml` is uncommitted).
- **Visual baselines are platform-specific** — Windows and Linux images differ, so
  baselines are stored per-platform and CI must generate its own.
- **The seeded accounts share one password**, acceptable only because the database
  is a development one; `TEST_LOGINS.md` is gitignored so it never reaches the
  remote.
- **Residual e2e flake under memory pressure** — mitigated with one retry locally
  (two in CI). On a 6 GB machine, `--workers=1` is the reliable setting.

---

## 10. Suggested thesis framing

**Problem.** Hospital record-keeping in much of the region is fragmented across
paper and disconnected systems: a lab result exists on one desk, the prescription
on another, and the doctor who ordered them learns of neither until someone walks
it over. Clinical decision support, where it exists at all, is a separate reference
book rather than something aware of the patient in front of you.

**What Sana argues.** That a single event-driven record — where releasing a lab
result *notifies* the ordering doctor, where deteriorating vitals *escalate*
without being asked, and where decision support is grounded in retrievable
sources rather than a model's memory — is both buildable on commodity
infrastructure and verifiable to a standard worth trusting.

**Chapters this material maps onto naturally:**

1. *Introduction* — problem, objectives, scope
2. *Literature review* — hospital information systems, RAG for clinical decision
   support, why retrieval-grounded rather than fine-tuned
3. *Methodology* — three-tier architecture, role analysis, iterative delivery
4. *System design* — data model, permission model, real-time event design, the
   anonymisation boundary
5. *Implementation* — the stack, the RAG pipeline, notable engineering decisions
6. *Testing and evaluation* — the strongest chapter: 347 automated tests across
   three strategies, plus defects found with explained mechanisms
7. *Conclusion* — limitations (AI service untested, single-hospital scope) and
   future work

The evaluation chapter is where this project can distinguish itself. Most student
projects assert "the system was tested and works." This one can present a
permission matrix derived from the system's own role definitions, measured
accessibility compliance with before-and-after contrast ratios, and a catalogue of
real defects with root-cause explanations — including honest discussion of two
defects in the *tests*, which demonstrates the evaluative maturity examiners look
for.
