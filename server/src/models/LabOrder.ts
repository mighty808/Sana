import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose'

// A LabOrder moves through this lifecycle as its individual tests get
// results entered against them:
//   ORDERED    -> just created, no results entered yet
//   PROCESSING -> at least one (but not all) of its tests has a result
//   COMPLETED  -> every test in the order has a result entered
//   REVIEWED   -> the ordering doctor has reviewed the completed results
// Nothing in this phase's endpoints transitions an order to REVIEWED yet —
// there's no "mark reviewed" action in the blueprint's REST table for lab
// orders, so that transition is left for a later phase (e.g. the doctor
// dashboard) to add, rather than inventing an endpoint not actually asked for.
export const LAB_ORDER_STATUSES = ['ORDERED', 'PROCESSING', 'COMPLETED', 'REVIEWED'] as const
export type LabOrderStatus = (typeof LAB_ORDER_STATUSES)[number]

export const LAB_ORDER_PRIORITIES = ['ROUTINE', 'URGENT'] as const
export type LabOrderPriority = (typeof LAB_ORDER_PRIORITIES)[number]

// One test requested within an order, e.g. { testName: 'Sputum smear', status: 'PENDING' }.
// Kept as an embedded subdocument array (not a separate collection) since
// these entries are small, always accessed together with their parent
// order, and never queried independently — same reasoning as
// emergencyContact on Patient (see models/Patient.ts).
const testItemSchema = new Schema(
  {
    testName: { type: String, required: true, trim: true },
    status: { type: String, enum: ['PENDING', 'COMPLETED'], default: 'PENDING' },
  },
  { _id: false },
)

// A doctor's request for one or more lab tests, made during an Encounter.
// Individual test results are stored separately (see models/LabResult.ts) —
// this document just tracks WHAT was requested and the order's overall progress.
const labOrderSchema = new Schema(
  {
    // Human-readable, sequential id like "LAB-2026-00001" (see utils/generateId.ts).
    labOrderNumber: { type: String, required: true, unique: true },
    encounter: { type: Schema.Types.ObjectId, ref: 'Encounter', required: true },
    patient: { type: Schema.Types.ObjectId, ref: 'Patient', required: true },
    doctor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    tests: { type: [testItemSchema], required: true },
    priority: { type: String, enum: LAB_ORDER_PRIORITIES, default: 'ROUTINE' },
    clinicalNotes: { type: String, trim: true },
    status: { type: String, enum: LAB_ORDER_STATUSES, default: 'ORDERED' },
    orderedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true },
)

// Powers "all orders for this patient" (patient history) and "this doctor's
// outstanding orders" (their personal queue).
labOrderSchema.index({ patient: 1, orderedAt: -1 })
labOrderSchema.index({ doctor: 1, status: 1 })

export type LabOrderAttrs = InferSchemaType<typeof labOrderSchema>
export type LabOrderDoc = HydratedDocument<LabOrderAttrs>
export const LabOrder = model<LabOrderAttrs>('LabOrder', labOrderSchema)
