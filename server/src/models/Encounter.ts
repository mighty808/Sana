import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose'

// An Encounter is the actual clinical record of a visit — the central event
// that VitalSigns, Diagnoses, LabOrders, and AiConsultations (added in later
// phases) all reference. Distinct from an Appointment, which is just the
// scheduled slot; a doctor "opens" an Encounter once the visit is actually happening.
export const ENCOUNTER_STATUSES = ['IN_PROGRESS', 'COMPLETED'] as const
export type EncounterStatus = (typeof ENCOUNTER_STATUSES)[number]

const encounterSchema = new Schema(
  {
    patient: { type: Schema.Types.ObjectId, ref: 'Patient', required: true },
    doctor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // Optional: an encounter can technically be opened without a prior
    // scheduled appointment (e.g. a walk-in), so this isn't required.
    appointment: { type: Schema.Types.ObjectId, ref: 'Appointment' },
    department: { type: Schema.Types.ObjectId, ref: 'Department', required: true },
    chiefComplaint: { type: String, required: true, trim: true },
    history: { type: String, trim: true },
    clinicalNotes: { type: String, trim: true },
    status: { type: String, enum: ENCOUNTER_STATUSES, default: 'IN_PROGRESS' },
    startedAt: { type: Date, required: true, default: Date.now },
    completedAt: { type: Date },
  },
  { timestamps: true },
)

// Powers "list this doctor's open encounters" and a patient's clinical
// history ordered newest-first.
encounterSchema.index({ doctor: 1, status: 1 })
encounterSchema.index({ patient: 1, startedAt: -1 })

export type EncounterAttrs = InferSchemaType<typeof encounterSchema>
export type EncounterDoc = HydratedDocument<EncounterAttrs>
export const Encounter = model<EncounterAttrs>('Encounter', encounterSchema)
