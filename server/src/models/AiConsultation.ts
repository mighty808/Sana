import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose'

export const AI_REVIEW_STATUSES = ['UNREVIEWED', 'ACCEPTED', 'PARTIALLY_ACCEPTED', 'IGNORED'] as const
export type AiReviewStatus = (typeof AI_REVIEW_STATUSES)[number]

// One query a doctor made to MediAssist AI during an encounter, and the
// RAG pipeline's response. Kept as its own collection, deliberately
// SEPARATE from Diagnosis/Encounter clinical fields — the AI never writes
// directly into the clinical record. A doctor who finds the guidance
// useful still has to manually add their own Diagnosis (Phase 4); this
// collection only records that the AI was consulted and how the doctor
// judged its answer (reviewStatus), for the blueprint's "human oversight"
// requirement and the Chapter 4 evaluation (acceptance rate).
const aiConsultationSchema = new Schema(
  {
    encounter: { type: Schema.Types.ObjectId, ref: 'Encounter', required: true },
    doctor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    patient: { type: Schema.Types.ObjectId, ref: 'Patient', required: true },
    query: { type: String, required: true, trim: true },
    // What was actually SENT to the AI service — deliberately just these
    // three clinical fields, never the patient's name/id/phone (see
    // ai.service.ts's buildAnonymizedContext). Stored here too so the
    // exact context behind a given answer is auditable later, without
    // needing to reconstruct it from the encounter as it stands today.
    patientContext: {
      chiefComplaint: { type: String, trim: true },
      vitals: { type: Schema.Types.Mixed },
      symptoms: { type: [String], default: undefined },
    },
    response: {
      diagnosticGuidance: { type: String, required: true },
      sources: {
        type: [
          {
            title: { type: String, required: true },
            excerpt: { type: String, required: true },
            score: { type: Number, required: true },
          },
        ],
        default: undefined,
      },
      // Every response carries this — never optional — per the blueprint's
      // safety rule that MediAssist AI is decision support, not a diagnosis.
      disclaimer: { type: String, required: true },
    },
    ragMetadata: {
      model: { type: String },
      retrievalCount: { type: Number },
      responseTimeMs: { type: Number },
    },
    // The doctor's judgement of the AI's answer — captured via
    // POST /ai/consultations/:id/review. Starts UNREVIEWED; the Chapter 4
    // evaluation reports the ACCEPTED/PARTIALLY_ACCEPTED/IGNORED split as
    // the "clinician acceptance rate" metric.
    reviewStatus: { type: String, enum: AI_REVIEW_STATUSES, default: 'UNREVIEWED' },
    doctorComment: { type: String, trim: true },
  },
  { timestamps: { createdAt: true, updatedAt: true } },
)

// Powers "all AI consultations for this encounter" (shown in the encounter
// view) and a doctor's own consultation history.
aiConsultationSchema.index({ encounter: 1, createdAt: 1 })
aiConsultationSchema.index({ doctor: 1, createdAt: -1 })

export type AiConsultationAttrs = InferSchemaType<typeof aiConsultationSchema>
export type AiConsultationDoc = HydratedDocument<AiConsultationAttrs>
export const AiConsultation = model<AiConsultationAttrs>('AiConsultation', aiConsultationSchema)
