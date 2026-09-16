import { Encounter } from '../models/Encounter.js'
import { assertEncounterOpen, mayReadEncounter } from './encounter.service.js'
import type { AuthedUser } from '../types/user.js'
import { VitalSign } from '../models/VitalSign.js'
import { LabOrder } from '../models/LabOrder.js'
import { LabResult } from '../models/LabResult.js'
import { Patient } from '../models/Patient.js'
import { AiConsultation, type AiReviewStatus, type AiConsultationSource, type AiAcuityLevel } from '../models/AiConsultation.js'
import { env } from '../config/env.js'
import { AppError, assertValidObjectId } from '../utils/apiResponse.js'
import { notify } from './notification.service.js'
import { logger } from '../utils/logger.js'
import { broadcastWardBoardChanged } from '../config/socket.js'

interface ConsultInput {
  encounter: string
  query: string
  symptoms?: string[]
}

// This is the shape the FastAPI /v1/consult endpoint sends back (see
// ai-service/main.py's ConsultResponse). It's written out here instead of
// imported from a shared location, because the two services just talk
// over plain HTTP — there's no shared TypeScript file connecting them. If
// the two ever get out of sync, a response that doesn't match this shape
// will fail Mongoose's validation when AiConsultation.create() runs,
// rather than silently saving something malformed.
interface ConsultResponse {
  diagnosticGuidance: string
  // `grounded` says whether the passage actually cleared the AI service's
  // relevance threshold and was given to the model, rather than merely being
  // among the nearest matches (see ai-service/rag/pipeline.py's
  // MIN_RELEVANCE_SCORE). Optional because consultations stored before the
  // flag existed have no value for it — absent means "not known", and the UI
  // must not render that as a grounding claim.
  sources?: Array<{ title: string; excerpt: string; score: number; grounded?: boolean }>
  disclaimer: string
  ragMetadata?: { model?: string; retrievalCount?: number; responseTimeMs?: number }
  // Only set when the request was made with assessAcuity: true (see
  // callAiService and analyzeVitalsForNurse below).
  acuityLevel?: AiAcuityLevel
  acuityReasons?: string[]
}

// Builds exactly what gets sent to the AI service — and just as
// importantly, decides what doesn't. Only anonymized context ever goes to
// the AI: never the patient's name, ID, or phone number. chiefComplaint
// and the most recent vitals are pulled automatically from the encounter
// and its VitalSign records; `symptoms` is whatever free text the doctor
// typed in alongside their question. Nothing in here ever touches
// Patient.firstName, lastName, phone, email, or patientNumber.
async function buildAnonymizedContext(encounterId: string, symptoms?: string[]) {
  const encounter = await Encounter.findById(encounterId)
  if (!encounter) throw new AppError('Encounter not found', 404, 'ENCOUNTER_NOT_FOUND')

  const latestVitals = await VitalSign.findOne({ encounter: encounterId }).sort({ recordedAt: -1 })

  return {
    encounter,
    context: {
      chiefComplaint: encounter.chiefComplaint,
      vitals: latestVitals
        ? {
            temperature: latestVitals.temperature,
            heartRate: latestVitals.heartRate,
            respiratoryRate: latestVitals.respiratoryRate,
            systolicBp: latestVitals.systolicBp,
            diastolicBp: latestVitals.diastolicBp,
            oxygenSaturation: latestVitals.oxygenSaturation,
          }
        : undefined,
      symptoms,
    },
  }
}

// Calls the separate FastAPI Sana AI service over HTTP. Every entry point
// below (the doctor's consult, the nurse's vitals analysis, the lab
// tech's result explanation) shares this one function, so the logic for
// making the call, timing it out, and handling errors only has to live
// in one place.
//
// If the AI service is unreachable or errors out, this throws a clean
// AppError with a 503 status — it does not crash the request or affect
// anything else. No other part of the app (patients, appointments, labs,
// billing) depends on this service at all, so if Sana AI goes down, the
// rest of the hospital system keeps working. The frontend is expected to
// show "Service unavailable — continue manually" when it gets this error.
async function callAiService(
  query: string,
  context: Record<string, unknown>,
  assessAcuity = false,
): Promise<{ response: ConsultResponse; responseTimeMs: number }> {
  const startedAt = Date.now()
  let aiResponse: ConsultResponse
  try {
    const res = await fetch(`${env.aiServiceUrl}/v1/consult`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Spread so the header is absent rather than present-and-undefined
        // when no token is configured — the AI service treats any value it
        // receives as a token to check, so sending the literal string
        // "undefined" would fail against a service that has one set.
        ...(env.aiServiceToken ? { 'X-Sana-Token': env.aiServiceToken } : {}),
      },
      body: JSON.stringify({ query, patientContext: context, assessAcuity }),
      // Keeps a slow/hung AI service from holding the request open
      // indefinitely — 20s is generous for a RAG pipeline call but still
      // bounded, so the caller gets a definite "unavailable" instead of
      // waiting forever.
      signal: AbortSignal.timeout(20_000),
    })

    if (!res.ok) {
      throw new AppError('Sana AI is currently unavailable', 503, 'AI_SERVICE_UNAVAILABLE')
    }
    aiResponse = (await res.json()) as ConsultResponse
  } catch (err) {
    if (err instanceof AppError) throw err
    // Covers: connection refused (service not running), timeout, DNS
    // failure, malformed JSON response — all collapse to the same clean
    // "unavailable" error rather than leaking a raw fetch/network error.
    throw new AppError('Sana AI is currently unavailable', 503, 'AI_SERVICE_UNAVAILABLE')
  }
  return { response: aiResponse, responseTimeMs: Date.now() - startedAt }
}

interface PersistConsultationInput {
  encounter: string
  doctor: string
  patient: string
  requestedBy?: string
  labResult?: string
  query: string
  source: AiConsultationSource
  context: Record<string, unknown>
  aiResponse: ConsultResponse
  responseTimeMs: number
}

// The one place that actually calls AiConsultation.create(). Every entry
// point below saves through this function, so the shape of what gets
// stored stays the same no matter which role or flow produced it.
async function persistConsultation(input: PersistConsultationInput) {
  return AiConsultation.create({
    encounter: input.encounter,
    doctor: input.doctor,
    patient: input.patient,
    requestedBy: input.requestedBy,
    labResult: input.labResult,
    query: input.query,
    source: input.source,
    patientContext: input.context,
    response: {
      diagnosticGuidance: input.aiResponse.diagnosticGuidance,
      sources: input.aiResponse.sources,
      disclaimer: input.aiResponse.disclaimer,
      // The AI service's Python side sends an explicit JSON `null` for
      // these on every non-acuity request, not an omitted key — assigning
      // that straight through would store a literal null on every
      // consultation instead of leaving the field unset. `?? undefined`
      // normalizes null to "not present" so only a real acuity read ever
      // sets these (see getWardBoard's aggregation, which depends on that).
      acuityLevel: input.aiResponse.acuityLevel ?? undefined,
      acuityReasons: input.aiResponse.acuityReasons ?? undefined,
    },
    ragMetadata: {
      model: input.aiResponse.ragMetadata?.model,
      retrievalCount: input.aiResponse.ragMetadata?.retrievalCount,
      responseTimeMs: input.aiResponse.ragMetadata?.responseTimeMs ?? input.responseTimeMs,
    },
  })
}

// Looks up the "{firstName} {lastName} — " prefix used on every AI
// notification message. This is its own function, separate from
// notifyAiResult below, so that a caller can start this lookup and the
// database save at the same time — they don't depend on each other. Only
// the final notify() call has to wait for both, since it needs the
// consultation's id, which only exists after the save finishes.
async function fetchPatientLabel(patientId: string) {
  const patient = await Patient.findById(patientId).select('firstName lastName')
  return patient ? `${patient.firstName} ${patient.lastName} — ` : ''
}

// Sends a real-time notification the moment Sana AI has an answer ready.
// It goes to whoever actually asked — doctor, nurse, or lab tech — not
// always the doctor. The patient's name is prefixed onto the message,
// matching how lab.result.ready and appointment.created notifications
// already work, so anyone reading their notification list can tell at a
// glance which patient it's about.
async function notifyAiResult(userId: string, patientLabel: string, aiResponse: ConsultResponse, consultationId: string) {
  await notify(userId, {
    type: 'ai.response.ready',
    title: 'Sana AI response ready',
    message: `${patientLabel}${aiResponse.diagnosticGuidance.slice(0, 140)}`,
    entityType: 'AiConsultation',
    entityId: consultationId,
  })
}

// Escalates straight to the doctor the moment a nurse's vitals check comes
// back CRITICAL, instead of leaving it as something the doctor only
// notices if and when they happen to open this particular encounter. This
// is deliberately its own notification, separate from notifyAiResult's
// routine "response ready" one the nurse gets — a doctor juggling several
// patients needs this one to stand out from the ordinary volume of AI
// activity, not blend into it.
async function notifyCriticalAcuity(
  doctorId: string,
  nurseId: string,
  patientLabel: string,
  aiResponse: ConsultResponse,
  consultationId: string,
) {
  if (doctorId === nurseId) return // the same person can't escalate to themselves
  const reasons = aiResponse.acuityReasons?.length ? aiResponse.acuityReasons.join('; ') : 'See the AI analysis for details'
  await notify(doctorId, {
    type: 'ai.acuity.critical',
    title: 'Critical vitals flagged',
    message: `${patientLabel}${reasons}`,
    entityType: 'AiConsultation',
    entityId: consultationId,
  })
}

// Saves the consultation and sends the routine "response ready"
// notification, together — the one tail every entry point below needs,
// just with different persistConsultation fields and a different
// recipient. `notifyUserId` is whoever should get that routine
// notification (not always the same person as `input.requestedBy` — see
// triggerAutoConsult, which notifies the doctor for a system-triggered
// consultation nobody actually "requested"). Returns patientLabel too,
// since analyzeVitalsForNurse needs it again for its own extra CRITICAL
// escalation notification.
async function persistAndNotify(input: PersistConsultationInput, notifyUserId: string) {
  const [consultation, patientLabel] = await Promise.all([
    persistConsultation(input),
    fetchPatientLabel(input.patient),
  ])
  await notifyAiResult(notifyUserId, patientLabel, input.aiResponse, consultation.id)
  return { consultation, patientLabel }
}

// Sends a doctor's question, plus anonymized encounter context, to Sana
// AI, stores the result, and notifies the doctor when it's ready.
export async function consultAI(input: ConsultInput, doctorId: string) {
  assertValidObjectId(input.encounter, 'encounter')

  // Restricted to the encounter's own assigned doctor — the same ownership
  // pattern encounter.service.ts's addDiagnosis/createLabOrder use — so a
  // doctor can't ask Sana AI about a patient who isn't theirs just by
  // passing an arbitrary encounter id. buildAnonymizedContext below is
  // shared with analyzeVitalsForNurse/triggerAutoConsult, neither of which
  // has a "doctor" caller to check against, so this check has to live here
  // rather than in that shared helper.
  const owned = await Encounter.exists({ _id: input.encounter, doctor: doctorId })
  if (!owned) throw new AppError('Encounter not found', 404, 'ENCOUNTER_NOT_FOUND')

  const { encounter, context } = await buildAnonymizedContext(input.encounter, input.symptoms)
  const { response: aiResponse, responseTimeMs } = await callAiService(input.query, context)

  const { consultation } = await persistAndNotify(
    {
      encounter: input.encounter,
      doctor: doctorId,
      patient: encounter.patient.toString(),
      requestedBy: doctorId,
      query: input.query,
      source: 'MANUAL',
      context,
      aiResponse,
      responseTimeMs,
    },
    doctorId,
  )

  return consultation
}

const AUTO_VITALS_QUERY =
  'Based on this patient\'s chief complaint and vitals, what should the care team be aware of, including any red flags, before the doctor sees them?'

// Fires automatically the first time vitals are recorded on an encounter
// (see encounter.service.ts's addVitals), so a suggestion from Sana AI is
// already waiting by the time the doctor opens the encounter, instead of
// the doctor having to remember to ask. This runs in the background — if
// it fails for any reason (the AI service being down, for example), that
// must never affect the vitals that were just saved, so nothing here
// waits on it, and any error is just logged rather than raised.
export async function triggerAutoConsult(encounterId: string, doctorId: string) {
  try {
    const { encounter, context } = await buildAnonymizedContext(encounterId)
    const { response: aiResponse, responseTimeMs } = await callAiService(AUTO_VITALS_QUERY, context)

    await persistAndNotify(
      {
        encounter: encounterId,
        doctor: doctorId,
        patient: encounter.patient.toString(),
        query: AUTO_VITALS_QUERY,
        source: 'AUTO_VITALS',
        context,
        aiResponse,
        responseTimeMs,
      },
      doctorId,
    )
  } catch (err) {
    logger.warn(`Auto-consult failed for encounter ${encounterId}: ${(err as Error).message}`)
  }
}

const NURSE_VITALS_QUERY =
  'Based on the vitals and chief complaint just recorded, what should the care team be aware of, including any red flags, before the doctor sees this patient?'

// A nurse-only shortcut into the same Sana AI pipeline (needs
// 'ai.analyzeVitals', not the doctor-only 'ai.consult' — see
// types/permissions.ts). Unlike the doctor's free-text question, this
// always asks about the vitals just recorded. Any optional `notes` the
// nurse types get added into the same `symptoms` slot a doctor's free
// text would use. The routine "response ready" notification goes to the
// nurse who asked, not the doctor, so a doctor isn't pinged every time a
// nurse checks vitals — the doctor will still see this entry in their own
// list for the encounter, since that list isn't filtered by who asked. The
// one exception is a CRITICAL acuity read: that escalates straight to the
// doctor too (see notifyCriticalAcuity), since that's exactly the kind of
// thing a doctor shouldn't only notice by chance.
export async function analyzeVitalsForNurse(encounterId: string, nurseId: string, notes?: string) {
  assertValidObjectId(encounterId, 'encounter')

  const { encounter, context } = await buildAnonymizedContext(encounterId, notes ? [notes] : undefined)
  // Same closed-record guard as every other write path on this encounter
  // (encounter.service.ts's addVitals/addDiagnosis) — without it, a nurse
  // could trigger a fresh AI analysis, and potentially a CRITICAL
  // doctor-escalation notification, against a visit that's already been
  // completed and locked.
  assertEncounterOpen(encounter, 'analyze vitals on')
  const { response: aiResponse, responseTimeMs } = await callAiService(NURSE_VITALS_QUERY, context, true)

  const { consultation, patientLabel } = await persistAndNotify(
    {
      encounter: encounterId,
      doctor: encounter.doctor.toString(),
      patient: encounter.patient.toString(),
      requestedBy: nurseId,
      query: NURSE_VITALS_QUERY,
      source: 'NURSE_VITALS_ANALYSIS',
      context,
      aiResponse,
      responseTimeMs,
    },
    nurseId,
  )

  if (aiResponse.acuityLevel === 'CRITICAL') {
    await notifyCriticalAcuity(encounter.doctor.toString(), nurseId, patientLabel, aiResponse, consultation.id)
  }

  broadcastWardBoardChanged(encounterId)
  return consultation
}

const LAB_RESULT_QUERY = 'Explain this lab result in plain terms — what does it indicate, and what should be flagged for the doctor?'

// A lab-tech-only shortcut (needs 'ai.explainLabResult', not the
// doctor-only 'ai.consult') that asks Sana AI to explain one specific
// entered result in plain terms. This never sends the patient's name —
// only the result's own fields (test name, value, unit, reference range,
// interpretation) plus whatever optional notes the lab tech typed.
export async function explainLabResult(labResultId: string, labTechId: string, notes?: string) {
  assertValidObjectId(labResultId, 'labResult')

  const result = await LabResult.findById(labResultId)
  if (!result) throw new AppError('Lab result not found', 404, 'LAB_RESULT_NOT_FOUND')

  const order = await LabOrder.findById(result.labOrder).select('encounter doctor patient')
  if (!order) throw new AppError('Lab order not found', 404, 'LAB_ORDER_NOT_FOUND')

  const context = {
    testResult: {
      testName: result.testName,
      resultValue: result.resultValue,
      unit: result.unit,
      referenceRange: result.referenceRange,
      interpretation: result.interpretation,
    },
    symptoms: notes ? [notes] : undefined,
  }

  const { response: aiResponse, responseTimeMs } = await callAiService(LAB_RESULT_QUERY, context)

  const { consultation } = await persistAndNotify(
    {
      encounter: order.encounter.toString(),
      doctor: order.doctor.toString(),
      patient: order.patient.toString(),
      requestedBy: labTechId,
      labResult: labResultId,
      query: LAB_RESULT_QUERY,
      source: 'LABTECH_RESULT_ANALYSIS',
      context,
      aiResponse,
      responseTimeMs,
    },
    labTechId,
  )

  return consultation
}

// Lists every Sana AI consultation for one encounter, in the order they
// were asked. This is shown alongside the encounter so a doctor can see
// the full back-and-forth they've had with Sana AI during this visit —
// across every role that asked something, not just the doctor's own
// questions. GET /ai/consultations also accepts the 'ai.analyzeVitals'
// permission now (see ai.routes.ts's requireAnyPermission), so a nurse
// without 'ai.consult' can reach this too — but they should only ever see
// their own NURSE_VITALS_ANALYSIS entries, never a doctor's own MANUAL
// consult questions on the same encounter. That role-based visibility
// rule is derived here, from the caller's own permissions, the same way
// listLabOrders/listInvoices take the full requesting user rather than
// having each route work out its own scoping — so a second route that
// needs this same list doesn't have to re-derive the mapping by hand.
export async function listConsultationsForEncounter(encounterId: string, requestingUser: AuthedUser) {
  assertValidObjectId(encounterId, 'encounter')

  // Two different questions get asked here, and the `sources` filter below
  // only answers the second one:
  //   1. May this caller read this encounter at all? Without this check,
  //      the encounter id comes straight off the query string, so a doctor
  //      could read the AI history — chief complaint, the symptoms a
  //      colleague typed in, and Sana AI's diagnostic guidance — for any
  //      patient in the hospital just by substituting an id, exactly the
  //      hole mayReadEncounter closes for GET /encounters/:id and the lab
  //      order lookups.
  //   2. Which of this encounter's consultations may they see? (below)
  // Returns an empty list rather than a 404, matching
  // listLabOrdersForEncounter: any page legitimately calling this has
  // already loaded the encounter, so an error would only ever be seen by
  // someone probing ids, and [] tells them nothing.
  if (!(await mayReadEncounter(encounterId, requestingUser))) return []

  const sources: AiConsultationSource[] | undefined = requestingUser.role.permissions.includes('ai.consult')
    ? undefined
    : ['NURSE_VITALS_ANALYSIS']
  const filter: Record<string, unknown> = { encounter: encounterId }
  if (sources) filter.source = { $in: sources }
  return AiConsultation.find(filter).sort({ createdAt: 1 })
}

// Lists past explanations for every result on one lab order, in a single
// query. Without this, showing an order with several test results would
// mean a separate lookup per result — this combines all of that into one
// round trip instead, since AiConsultation
// only stores which lab result it's about, not which order that result
// belongs to.
export async function listConsultationsForLabOrder(labOrderId: string) {
  assertValidObjectId(labOrderId, 'labOrder')
  const results = await LabResult.find({ labOrder: labOrderId }).select('_id')
  const labResultIds = results.map((r) => r._id)
  return AiConsultation.find({ labResult: { $in: labResultIds } }).sort({ createdAt: 1 })
}

// Records the doctor's judgement of one AI response — accepted, partially
// accepted, or ignored. This is the human-oversight step that matters
// most: the AI never writes to the clinical record itself, so a doctor
// reviewing its answer is what actually closes the loop. Only the same
// doctor assigned to the encounter can do this — someone else's
// consultation isn't this doctor's to grade. If the ids don't match, this
// reports a 404 rather than a 403, so it doesn't even confirm to the
// caller that the consultation exists.
export async function reviewConsultation(
  id: string,
  doctorId: string,
  reviewStatus: AiReviewStatus,
  doctorComment?: string,
) {
  const consultation = await AiConsultation.findOneAndUpdate(
    { _id: id, doctor: doctorId },
    { reviewStatus, doctorComment },
    { returnDocument: 'after' },
  )
  if (!consultation) throw new AppError('AI consultation not found', 404, 'AI_CONSULTATION_NOT_FOUND')
  return consultation
}
