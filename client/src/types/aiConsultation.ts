export const AI_REVIEW_STATUSES = ['UNREVIEWED', 'ACCEPTED', 'PARTIALLY_ACCEPTED', 'IGNORED'] as const
export type AiReviewStatus = (typeof AI_REVIEW_STATUSES)[number]

// MANUAL: a doctor typed this question themselves. AUTO_VITALS: fired
// automatically when a Nurse recorded the encounter's first vitals — see
// server/src/services/ai.service.ts's triggerAutoConsult.
export const AI_CONSULTATION_SOURCES = ['MANUAL', 'AUTO_VITALS'] as const
export type AiConsultationSource = (typeof AI_CONSULTATION_SOURCES)[number]

export interface AiSource {
  title: string
  excerpt: string
  score: number
}

// Mirrors server/src/models/AiConsultation.ts exactly. `patientContext` is
// what was actually sent to the AI service (anonymized — chief complaint +
// latest vitals + doctor-typed symptoms, never patient name/id/phone),
// stored here for audit purposes rather than something the UI needs to
// construct itself.
export interface AiConsultation {
  _id: string
  encounter: string
  doctor: string
  patient: string
  query: string
  source: AiConsultationSource
  patientContext: {
    chiefComplaint?: string
    vitals?: Record<string, number | undefined>
    symptoms?: string[]
  }
  response: {
    diagnosticGuidance: string
    sources?: AiSource[]
    disclaimer: string
  }
  ragMetadata?: {
    model?: string
    retrievalCount?: number
    responseTimeMs?: number
  }
  reviewStatus: AiReviewStatus
  doctorComment?: string
  createdAt: string
}
