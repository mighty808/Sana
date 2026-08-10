import { z } from 'zod'

// Validates POST /ai/consult request bodies. `symptoms` is doctor-entered
// free text (not derived from any structured field elsewhere in the
// record) — chiefComplaint and vitals are pulled automatically from the
// encounter itself (see ai.service.ts's buildAnonymizedContext).
export const consultAiSchema = z.object({
  encounter: z.string().min(1), // Encounter ObjectId — existence checked in the service layer
  query: z.string().trim().min(1).max(2000),
  symptoms: z.array(z.string().trim().min(1)).optional(),
})

// Validates POST /ai/consultations/:id/review request bodies. UNREVIEWED is
// deliberately excluded — it's the default state a consultation starts in,
// not something a doctor can set it back to via a review action.
export const reviewAiConsultationSchema = z.object({
  reviewStatus: z.enum(['ACCEPTED', 'PARTIALLY_ACCEPTED', 'IGNORED']),
  doctorComment: z.string().trim().max(2000).optional(),
})
