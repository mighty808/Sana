import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose'

// An Encounter is the actual clinical record of a visit. It's the central
// record that vitals, diagnoses, lab orders, and AI consultations all
// point back to. It's different from an Appointment, which is just the
// scheduled slot — a nurse "opens" an Encounter once the visit is
// actually happening (check-in and vitals), and the doctor then continues
// working on that same encounter.
export const ENCOUNTER_STATUSES = ['IN_PROGRESS', 'COMPLETED'] as const
export type EncounterStatus = (typeof ENCOUNTER_STATUSES)[number]

const encounterSchema = new Schema(
  {
    patient: { type: Schema.Types.ObjectId, ref: 'Patient', required: true },
    doctor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // This isn't marked required at the database level, even though in
    // practice a nurse always opens an encounter from an appointment. The
    // real rule lives in encounter.service.ts's createEncounter instead,
    // so there's only one place enforcing it rather than two that could
    // drift apart.
    appointment: { type: Schema.Types.ObjectId, ref: 'Appointment' },
    chiefComplaint: { type: String, required: true, trim: true },
    history: { type: String, trim: true },
    clinicalNotes: { type: String, trim: true },
    status: { type: String, enum: ENCOUNTER_STATUSES, default: 'IN_PROGRESS' },
    startedAt: { type: Date, required: true, default: Date.now },
    completedAt: { type: Date },
    // Flips to true the first time encounter.service.ts's addVitals fires
    // the auto-consult trigger, which asks Sana AI to look at the vitals
    // as soon as they're recorded. This uses one findOneAndUpdate call to
    // flip the flag, instead of counting how many vitals entries exist so
    // far. That matters if two vitals get submitted for the same
    // encounter at almost the same moment: MongoDB only lets one of those
    // two updates actually flip the flag from false to true, so the
    // trigger still only ever fires once, even in that split-second race.
    autoConsultTriggered: { type: Boolean, default: false },
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
