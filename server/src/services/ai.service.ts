import { Encounter } from '../models/Encounter.js'
import { VitalSign } from '../models/VitalSign.js'
import { AiConsultation, type AiReviewStatus } from '../models/AiConsultation.js'
import { env } from '../config/env.js'
import { AppError, assertValidObjectId } from '../utils/apiResponse.js'
import { notify } from './notification.service.js'

interface ConsultInput {
  encounter: string
  query: string
  symptoms?: string[]
}

// Shape returned by the FastAPI /v1/consult endpoint (see ai-service/main.py's
// ConsultResponse). Kept as its own type here rather than imported from
// anywhere shared, since the two services communicate over HTTP with no
// shared TypeScript types — this is Express's own understanding of the
// FastAPI contract, and if the two ever drift, a response that doesn't
// match this shape will fail Mongoose validation on AiConsultation.create()
// rather than silently storing malformed data.
interface ConsultResponse {
  diagnosticGuidance: string
  sources?: Array<{ title: string; excerpt: string; score: number }>
  disclaimer: string
  ragMetadata?: { model?: string; retrievalCount?: number; responseTimeMs?: number }
}

// Builds exactly what gets sent to the AI service — and, just as
// importantly, what does NOT. Per the blueprint's safety rules: "Only
// anonymized context sent to AI — never patient name, ID, or phone."
// chiefComplaint and the most recent vitals are pulled automatically from
// the encounter/its VitalSign records; `symptoms` is whatever free text the
// doctor typed in alongside their query. Nothing here ever touches
// Patient.firstName/lastName/phone/email/patientNumber.
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

// Sends a doctor's query (plus anonymized encounter context) to the
// separate FastAPI MediAssist AI service, stores the result as an
// AiConsultation, and pushes a real-time notification when it's ready.
//
// Graceful degradation: if the AI service is unreachable or errors, this
// throws a clean AppError(..., 503) — it does NOT crash or affect anything
// else. Every other module (patients, appointments, labs, billing) has no
// dependency on this service at all, so an AI outage never takes down the
// rest of the hospital system; the frontend's AI panel is expected to show
// "Service unavailable — continue manually" when it receives this error,
// per the blueprint's section 4.4.
export async function consultAI(input: ConsultInput, doctorId: string) {
  assertValidObjectId(input.encounter, 'encounter')

  const { encounter, context } = await buildAnonymizedContext(input.encounter, input.symptoms)

  const startedAt = Date.now()
  let aiResponse: ConsultResponse
  try {
    const res = await fetch(`${env.aiServiceUrl}/v1/consult`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: input.query, patientContext: context }),
      // Keeps a slow/hung AI service from holding the request open
      // indefinitely — 20s is generous for a RAG pipeline call but still
      // bounded, so a doctor gets a definite "unavailable" instead of
      // waiting forever.
      signal: AbortSignal.timeout(20_000),
    })

    if (!res.ok) {
      throw new AppError('MediAssist AI is currently unavailable', 503, 'AI_SERVICE_UNAVAILABLE')
    }
    aiResponse = (await res.json()) as ConsultResponse
  } catch (err) {
    if (err instanceof AppError) throw err
    // Covers: connection refused (service not running), timeout, DNS
    // failure, malformed JSON response — all collapse to the same clean
    // "unavailable" error rather than leaking a raw fetch/network error.
    throw new AppError('MediAssist AI is currently unavailable', 503, 'AI_SERVICE_UNAVAILABLE')
  }
  const responseTimeMs = Date.now() - startedAt

  const consultation = await AiConsultation.create({
    encounter: input.encounter,
    doctor: doctorId,
    patient: encounter.patient,
    query: input.query,
    patientContext: context,
    response: {
      diagnosticGuidance: aiResponse.diagnosticGuidance,
      sources: aiResponse.sources,
      disclaimer: aiResponse.disclaimer,
    },
    ragMetadata: {
      model: aiResponse.ragMetadata?.model,
      retrievalCount: aiResponse.ragMetadata?.retrievalCount,
      responseTimeMs: aiResponse.ragMetadata?.responseTimeMs ?? responseTimeMs,
    },
  })

  // Real-time push per the blueprint's "ai.response.ready — doctor gets
  // alert when AI finishes processing." In practice the doctor is usually
  // sitting right there waiting on the same request/response cycle that
  // triggered this, but the notification still matters for the "logged in
  // on another tab/device" case, and keeps this event consistent with how
  // lab.result.ready and appointment.created already work.
  await notify(doctorId, {
    type: 'ai.response.ready',
    title: 'MediAssist AI response ready',
    message: aiResponse.diagnosticGuidance.slice(0, 140),
    entityType: 'AiConsultation',
    entityId: consultation.id,
  })

  return consultation
}

// Lists AI consultations for one encounter, in the order they were asked —
// shown alongside the encounter so a doctor can see the full back-and-forth
// they've had with MediAssist AI during this visit.
export async function listConsultationsForEncounter(encounterId: string) {
  assertValidObjectId(encounterId, 'encounter')
  return AiConsultation.find({ encounter: encounterId }).sort({ createdAt: 1 })
}

// Records the doctor's judgement of one AI response — accepted, partially
// accepted, or ignored. This is the human-oversight step the blueprint's
// safety rules require: the AI never writes to the clinical record itself,
// a doctor reviewing its answer is what closes the loop. Restricted to the
// SAME doctor who asked the question — someone else's consultation isn't
// this doctor's to grade — reported as a 404 (not 403) so the mismatch
// doesn't confirm the consultation's existence to a caller who shouldn't see it.
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
