export const AI_REVIEW_STATUSES = ['UNREVIEWED', 'ACCEPTED', 'PARTIALLY_ACCEPTED', 'IGNORED'] as const
export type AiReviewStatus = (typeof AI_REVIEW_STATUSES)[number]

// MANUAL means a doctor typed this question themselves. AUTO_VITALS means
// it happened automatically when a Nurse recorded the encounter's first
// vitals (see server/src/services/ai.service.ts's triggerAutoConsult).
// NURSE_VITALS_ANALYSIS means a Nurse clicked the "AI Analysis" button on
// vitals (analyzeVitalsForNurse). LABTECH_RESULT_ANALYSIS means a Lab Tech
// clicked the "Explain result" button on one test result
// (explainLabResult).
export const AI_CONSULTATION_SOURCES = [
  'MANUAL',
  'AUTO_VITALS',
  'NURSE_VITALS_ANALYSIS',
  'LABTECH_RESULT_ANALYSIS',
] as const
export type AiConsultationSource = (typeof AI_CONSULTATION_SOURCES)[number]

// Only set on NURSE_VITALS_ANALYSIS consultations — a triage read
// combining hard vitals thresholds with the LLM's read of the retrieved
// knowledge base (see ai-service/rag/pipeline.py's _assess_vitals and
// _run_acuity_llm).
export const AI_ACUITY_LEVELS = ['STABLE', 'URGENT', 'CRITICAL'] as const
export type AiAcuityLevel = (typeof AI_ACUITY_LEVELS)[number]

export interface AiSource {
  title: string
  excerpt: string
  score: number
  // Whether the AI actually read this passage, or whether it was just one of
  // the nearest matches and fell below the relevance threshold (see
  // ai-service/rag/pipeline.py's MIN_RELEVANCE_SCORE). Optional: consultations
  // saved before this field existed carry no value, and "absent" means
  // unknown — never assume grounded.
  grounded?: boolean
}

// This matches server/src/models/AiConsultation.ts exactly. `patientContext`
// is the anonymized information that was actually sent to the AI service:
// the chief complaint, latest vitals, and doctor-typed symptoms, or a test
// result's own fields. It never includes the patient's name, id, or phone
// number. It's stored here so it can be reviewed later, not something the
// screen needs to build itself.
export interface AiConsultation {
  _id: string
  encounter: string
  doctor: string
  patient: string
  requestedBy?: string
  labResult?: string
  query: string
  source: AiConsultationSource
  patientContext: {
    chiefComplaint?: string
    vitals?: Record<string, number | undefined>
    symptoms?: string[]
    testResult?: {
      testName?: string
      resultValue?: string
      unit?: string
      referenceRange?: string
      interpretation?: string
    }
  }
  response: {
    diagnosticGuidance: string
    sources?: AiSource[]
    disclaimer: string
    acuityLevel?: AiAcuityLevel
    acuityReasons?: string[]
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
