import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose'

export const AI_REVIEW_STATUSES = ['UNREVIEWED', 'ACCEPTED', 'PARTIALLY_ACCEPTED', 'IGNORED'] as const
export type AiReviewStatus = (typeof AI_REVIEW_STATUSES)[number]

// MANUAL: a doctor typed this question themselves. AUTO_VITALS: fired
// automatically when a Nurse recorded the encounter's first vitals (see
// ai.service.ts's triggerAutoConsult). NURSE_VITALS_ANALYSIS: a Nurse used
// the fixed "AI Analysis" button on vitals they just recorded (see
// ai.service.ts's analyzeVitalsForNurse). LABTECH_RESULT_ANALYSIS: a Lab
// Tech used the fixed "Explain result" button on one test result (see
// ai.service.ts's explainLabResult).
export const AI_CONSULTATION_SOURCES = [
  'MANUAL',
  'AUTO_VITALS',
  'NURSE_VITALS_ANALYSIS',
  'LABTECH_RESULT_ANALYSIS',
] as const
export type AiConsultationSource = (typeof AI_CONSULTATION_SOURCES)[number]

export const AI_ACUITY_LEVELS = ['STABLE', 'URGENT', 'CRITICAL'] as const
export type AiAcuityLevel = (typeof AI_ACUITY_LEVELS)[number]

// One question asked to Sana AI during an encounter, and the answer the
// RAG pipeline gave back. This is kept as its own collection, separate
// from Diagnosis and Encounter, because Sana AI never writes into the
// clinical record directly — a doctor who finds its answer useful still
// has to add their own Diagnosis by hand. All this collection records is
// that Sana AI was asked something, and whether the doctor accepted,
// partially accepted, or ignored the answer (reviewStatus) — that
// human-review step is what keeps a person in charge of every decision.
const aiConsultationSchema = new Schema(
  {
    encounter: { type: Schema.Types.ObjectId, ref: 'Encounter', required: true },
    // This is always the doctor responsible for the encounter, no matter
    // who actually asked the question — even for a nurse's vitals check or
    // a lab tech's result explanation, this still points at that
    // encounter's doctor. That keeps reviewConsultation's ownership check
    // (which looks up `{_id, doctor: doctorId}`) working the same way for
    // every source: only the responsible doctor ever reviews an answer,
    // regardless of who triggered it.
    doctor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    patient: { type: Schema.Types.ObjectId, ref: 'Patient', required: true },
    // Who actually asked: the doctor for MANUAL, the nurse for
    // NURSE_VITALS_ANALYSIS, the lab tech for LABTECH_RESULT_ANALYSIS. Left
    // empty for AUTO_VITALS, since nobody asked — the system triggered it
    // on its own.
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    // Only set for LABTECH_RESULT_ANALYSIS — points at the specific lab
    // result being explained.
    labResult: { type: Schema.Types.ObjectId, ref: 'LabResult' },
    query: { type: String, required: true, trim: true },
    source: { type: String, enum: AI_CONSULTATION_SOURCES, default: 'MANUAL' },
    // Exactly what was sent to the AI service — just these clinical
    // fields, never the patient's name, ID, or phone number (see
    // ai.service.ts's buildAnonymizedContext for how that's built). It's
    // stored here too so that, later, you can see exactly what context a
    // given answer was based on, without having to reconstruct it from
    // whatever the encounter looks like today.
    patientContext: {
      chiefComplaint: { type: String, trim: true },
      vitals: { type: Schema.Types.Mixed },
      symptoms: { type: [String], default: undefined },
      // Only set for LABTECH_RESULT_ANALYSIS — holds {testName,
      // resultValue, unit, referenceRange, interpretation}. Kept in its
      // own field rather than reusing chiefComplaint/vitals/symptoms,
      // since that flow doesn't have any of those — it's about a lab
      // result, not a visit.
      testResult: { type: Schema.Types.Mixed },
    },
    response: {
      diagnosticGuidance: { type: String, required: true },
      sources: {
        type: [
          {
            title: { type: String, required: true },
            excerpt: { type: String, required: true },
            score: { type: Number, required: true },
            // Whether this passage was actually given to the model as
            // grounding, or was merely a nearest match that fell below the
            // relevance threshold (ai-service/rag/pipeline.py's
            // MIN_RELEVANCE_SCORE). Deliberately NOT required and with no
            // default: consultations saved before this field existed are
            // still in Atlas, and defaulting them to `false` would be
            // inventing a fact about a retrieval nobody recorded. Absent
            // means unknown, which is what the UI renders.
            grounded: { type: Boolean },
          },
        ],
        default: undefined,
      },
      // Every response carries this, and it's never optional — Sana AI is
      // decision support, not a diagnosis, and that has to be said every time.
      disclaimer: { type: String, required: true },
      // Only set for NURSE_VITALS_ANALYSIS — a triage read combining
      // hard vitals thresholds with the LLM's read of the retrieved
      // knowledge-base passages (see ai-service/rag/pipeline.py's
      // _assess_vitals and _run_acuity_llm). acuityReasons names the
      // specific findings that drove the level, e.g. "Oxygen saturation
      // 88% is critically low".
      acuityLevel: { type: String, enum: AI_ACUITY_LEVELS },
      acuityReasons: { type: [String], default: undefined },
    },
    ragMetadata: {
      model: { type: String },
      retrievalCount: { type: Number },
      responseTimeMs: { type: Number },
    },
    // The doctor's judgement of the AI's answer, set through POST
    // /ai/consultations/:id/review. Every consultation starts out
    // UNREVIEWED until the doctor marks it accepted, partially accepted,
    // or ignored.
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
