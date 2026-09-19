import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose'

export const LAB_RESULT_INTERPRETATIONS = ['NORMAL', 'ABNORMAL', 'CRITICAL'] as const
export type LabResultInterpretation = (typeof LAB_RESULT_INTERPRETATIONS)[number]

// A result entered for one test within a LabOrder. The `status` field
// controls whether a patient can see it: a result starts out ENTERED,
// visible only to staff, and only becomes visible to the patient once a
// lab tech explicitly RELEASEs it — a deliberate two-step process, so a
// result is never shown to a patient the moment it's typed in.
export const LAB_RESULT_STATUSES = ['ENTERED', 'RELEASED'] as const
export type LabResultStatus = (typeof LAB_RESULT_STATUSES)[number]

const labResultSchema = new Schema(
  {
    labOrder: { type: Schema.Types.ObjectId, ref: 'LabOrder', required: true },
    // This is also stored directly on the order, copied here too so
    // results can be looked up per patient without a separate lookup
    // through labOrder each time — the same pattern as
    // VitalSign.patient in models/VitalSign.ts.
    patient: { type: Schema.Types.ObjectId, ref: 'Patient', required: true },
    // Whoever entered the result — the Lab Technician role.
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
