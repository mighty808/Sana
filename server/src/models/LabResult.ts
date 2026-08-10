import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose'

export const LAB_RESULT_INTERPRETATIONS = ['NORMAL', 'ABNORMAL', 'CRITICAL'] as const
export type LabResultInterpretation = (typeof LAB_RESULT_INTERPRETATIONS)[number]

// A result entered for one test within a LabOrder. `status` gates patient
// visibility: a result starts ENTERED (staff-only) and only becomes visible
// to the patient once explicitly RELEASED — matching the blueprint's
// "Admin enters results -> releases" workflow and the role table's "Patient:
// view own ... APPROVED lab results" (approved == released).
export const LAB_RESULT_STATUSES = ['ENTERED', 'RELEASED'] as const
export type LabResultStatus = (typeof LAB_RESULT_STATUSES)[number]

const labResultSchema = new Schema(
  {
    labOrder: { type: Schema.Types.ObjectId, ref: 'LabOrder', required: true },
    // Denormalized from the order (see the identical pattern + reasoning on
    // VitalSign.patient in models/VitalSign.ts) so results can be queried
    // per-patient without populating through labOrder every time.
    patient: { type: Schema.Types.ObjectId, ref: 'Patient', required: true },
    // Whoever entered the result — Admin in this MVP (no separate Lab
    // Technician role — see blueprint section 1.3).
    performedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    testName: { type: String, required: true, trim: true },
    resultValue: { type: String, required: true, trim: true },
    unit: { type: String, trim: true },
    referenceRange: { type: String, trim: true },
    interpretation: { type: String, enum: LAB_RESULT_INTERPRETATIONS },
    notes: { type: String, trim: true },
    resultedAt: { type: Date, required: true, default: Date.now },
    status: { type: String, enum: LAB_RESULT_STATUSES, default: 'ENTERED' },
    releasedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    releasedAt: { type: Date },
  },
  { timestamps: true },
)

// Powers "all results for this order" (shown alongside the order) and
// "this patient's released result history."
labResultSchema.index({ labOrder: 1 })
labResultSchema.index({ patient: 1, status: 1, resultedAt: -1 })

export type LabResultAttrs = InferSchemaType<typeof labResultSchema>
export type LabResultDoc = HydratedDocument<LabResultAttrs>
export const LabResult = model<LabResultAttrs>('LabResult', labResultSchema)
