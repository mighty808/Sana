import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose'

// A prescription moves through this lifecycle. Unlike LabOrder (which
// tracks each test's own status as results trickle in over time, hence the
// separate LabOrder/LabResult split), dispensing a prescription is a
// single atomic action — the pharmacist hands over every medication on it
// at once — so there's no per-medication status to track, and no reason
// for a second collection the way LabResult exists for LabOrder.
export const PRESCRIPTION_STATUSES = ['PRESCRIBED', 'DISPENSED', 'CANCELLED'] as const
export type PrescriptionStatus = (typeof PRESCRIPTION_STATUSES)[number]

// One medication on a prescription, e.g. { drugName: 'Amoxicillin',
// dosage: '500mg', frequency: 'Three times daily', duration: '7 days' }.
// These live directly inside the prescription document, not their own
// collection — same reasoning as LabOrder.tests: small, always read
// together with the prescription, never looked up on their own.
const medicationItemSchema = new Schema(
  {
    drugName: { type: String, required: true, trim: true },
    dosage: { type: String, required: true, trim: true },
    frequency: { type: String, required: true, trim: true },
    duration: { type: String, required: true, trim: true },
    instructions: { type: String, trim: true },
  },
  { _id: false },
)

// A doctor's medication plan for a patient, written during an Encounter.
// Dispensed by a Pharmacist, then billed the same way a LabOrder is (see
// invoice.service.ts's createInvoice, which accepts either a labOrder or a
// prescription).
const prescriptionSchema = new Schema(
  {
    // Human-readable, sequential id like "RX-2026-00001" (see utils/generateId.ts).
    prescriptionNumber: { type: String, required: true, unique: true },
    encounter: { type: Schema.Types.ObjectId, ref: 'Encounter', required: true },
    patient: { type: Schema.Types.ObjectId, ref: 'Patient', required: true },
    doctor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    medications: { type: [medicationItemSchema], required: true },
    status: { type: String, enum: PRESCRIPTION_STATUSES, default: 'PRESCRIBED' },
    // Whoever actually dispensed it — the Pharmacist role. Only set once
    // status moves to DISPENSED (see prescription.service.ts's dispensePrescription).
    dispensedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    dispensedAt: { type: Date },
  },
  { timestamps: true },
)

// Powers "all prescriptions for this encounter" (shown on the encounter
// page), "this doctor's own prescriptions," and the pharmacy queue.
prescriptionSchema.index({ encounter: 1 })
prescriptionSchema.index({ doctor: 1, status: 1 })
prescriptionSchema.index({ status: 1 })

export type PrescriptionAttrs = InferSchemaType<typeof prescriptionSchema>
export type PrescriptionDoc = HydratedDocument<PrescriptionAttrs>
export const Prescription = model<PrescriptionAttrs>('Prescription', prescriptionSchema)
