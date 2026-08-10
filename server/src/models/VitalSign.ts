import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose'

// One set of vitals recorded during an Encounter — typically by a Nurse.
// An encounter can have multiple VitalSign entries over time (e.g. recorded
// on arrival, then again later), so this is its own collection rather than
// embedded fields on Encounter.
const vitalSignSchema = new Schema(
  {
    encounter: { type: Schema.Types.ObjectId, ref: 'Encounter', required: true },
    // Denormalized from the encounter (also stored directly here) so vitals
    // can be queried per-patient across encounters without an extra join/populate.
    patient: { type: Schema.Types.ObjectId, ref: 'Patient', required: true },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    temperature: { type: Number }, // Celsius
    heartRate: { type: Number }, // beats per minute
    respiratoryRate: { type: Number }, // breaths per minute
    systolicBp: { type: Number }, // mmHg
    diastolicBp: { type: Number }, // mmHg
    oxygenSaturation: { type: Number }, // SpO2 %
    weight: { type: Number }, // kg
    height: { type: Number }, // cm
    recordedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true },
)

// Supports "all vitals for this encounter, in the order they were taken."
vitalSignSchema.index({ encounter: 1, recordedAt: 1 })

export type VitalSignAttrs = InferSchemaType<typeof vitalSignSchema>
export type VitalSignDoc = HydratedDocument<VitalSignAttrs>
export const VitalSign = model<VitalSignAttrs>('VitalSign', vitalSignSchema)
