import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose'

// A diagnosis the doctor records against an Encounter. An encounter can have
// more than one diagnosis (e.g. a primary + secondary diagnosis), so — like
// VitalSign — this is its own collection rather than embedded on Encounter.
const diagnosisSchema = new Schema(
  {
    encounter: { type: Schema.Types.ObjectId, ref: 'Encounter', required: true },
    patient: { type: Schema.Types.ObjectId, ref: 'Patient', required: true },
    doctor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    diagnosis: { type: String, required: true, trim: true },
    // Optional structured code (e.g. an ICD-10 code) for the diagnosis —
    // free text is always required, the code is a nice-to-have for later
    // reporting/analytics, not enforced against a real ICD code list in the MVP.
    diagnosisCode: { type: String, trim: true },
    notes: { type: String, trim: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }, // diagnoses are appended, not edited
)

diagnosisSchema.index({ encounter: 1 })

export type DiagnosisAttrs = InferSchemaType<typeof diagnosisSchema>
export type DiagnosisDoc = HydratedDocument<DiagnosisAttrs>
export const Diagnosis = model<DiagnosisAttrs>('Diagnosis', diagnosisSchema)
