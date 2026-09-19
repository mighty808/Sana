import { z } from 'zod'

// Validates POST /ai/consult request bodies. The `symptoms` field is text the
// doctor types in themselves, not something copied from another field in the
// record. The chief complaint and vitals are pulled in automatically from the
// encounter (see ai.service.ts's buildAnonymizedContext), so they don't need
// to be entered again here.
export const consultAiSchema = z.object({
  encounter: z.string().min(1), // Encounter ObjectId — existence checked in the service layer
  query: z.string().trim().min(1).max(2000),
  symptoms: z.array(z.string().trim().min(1)).optional(),
})

// Validates POST /ai/consultations/:id/review request bodies. UNREVIEWED is
// left out of the allowed values on purpose. It's the state a consultation
// starts in automatically, and a doctor's review action should only move it
// forward, not set it back to UNREVIEWED.
export const reviewAiConsultationSchema = z.object({
  reviewStatus: z.enum(['ACCEPTED', 'PARTIALLY_ACCEPTED', 'IGNORED']),
  doctorComment: z.string().trim().max(2000).optional(),
})

// Validates POST /ai/analyze-vitals request bodies (Nurse-only).
export const analyzeVitalsSchema = z.object({
  encounter: z.string().min(1),
  notes: z.string().trim().max(1000).optional(),
})

// Validates POST /ai/explain-lab-result request bodies (Lab Tech-only).
export const explainLabResultSchema = z.object({
  labResult: z.string().min(1),
  notes: z.string().trim().max(1000).optional(),
})
