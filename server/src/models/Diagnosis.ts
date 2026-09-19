import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose'

// A diagnosis the doctor records against an Encounter. An encounter can
// have more than one diagnosis — a primary and a secondary one, for
// example — so this is its own collection rather than fields embedded
// directly on Encounter, the same way VitalSign is.
const diagnosisSchema = new Schema(
  {
    encounter: { type: Schema.Types.ObjectId, ref: 'Encounter', required: true },
    patient: { type: Schema.Types.ObjectId, ref: 'Patient', required: true },
    doctor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    diagnosis: { type: String, required: true, trim: true },
    // An optional structured code (like an ICD-10 code) for the
    // diagnosis. The free-text diagnosis field is always required; this
    // code is a nice-to-have for reporting later on, not checked against
    // a real ICD code list.
    diagnosisCode: { type: String, trim: true },
    notes: { type: String, trim: true },
  },
  // No `updatedAt` field — a doctor can still correct a diagnosis (see
  // encounter.service.ts's updateDiagnosis), this just means the model
  // doesn't track when that last happened.
  { timestamps: { createdAt: true, updatedAt: false } },
)

diagnosisSchema.index({ encounter: 1 })

export type DiagnosisAttrs = InferSchemaType<typeof diagnosisSchema>
export type DiagnosisDoc = HydratedDocument<DiagnosisAttrs>
export const Diagnosis = model<DiagnosisAttrs>('Diagnosis', diagnosisSchema)
