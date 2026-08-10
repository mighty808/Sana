import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose'
import { BLOOD_GROUPS } from '../types/patient.js'

// A patient's demographic/registration record — separate from the `User`
// collection. Most patients in the system are registered by Admin/Doctor
// staff and never log in at all; only some patients also have a login
// account (role PATIENT) to view their own data online. That's why `user`
// below is optional and only gets set when such an account exists/is linked.
const patientSchema = new Schema(
  {
    // Human-readable, sequential id like "SAN-2026-00001" (see utils/generateId.ts).
    // This is what gets shown/printed to staff — not the internal MongoDB _id.
    patientNumber: { type: String, required: true, unique: true },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    dob: { type: Date, required: true },
    gender: { type: String, enum: ['MALE', 'FEMALE', 'OTHER'], required: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    address: { type: String, trim: true },
    bloodGroup: {
      type: String,
      enum: BLOOD_GROUPS,
      default: 'UNKNOWN',
    },
    // Embedded subdocument (not a separate collection) since it's simple,
    // always small, and never queried independently — matches blueprint
    // section 5.2's guidance to embed small, non-reused nested data.
    emergencyContact: {
      name: { type: String, trim: true },
      phone: { type: String, trim: true },
    },
    // Links this patient record to a login account with role PATIENT, IF one
    // exists. Lets a logged-in patient's `req.user.id` be matched against
    // `patient.user` to enforce "patients can only see their own records" (FR18).
    // Not part of the blueprint's literal collection field list, but required
    // to actually implement that requirement.
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    // Soft-delete flag — VOIDED records are excluded from normal search
    // results but never physically deleted, preserving the clinical history.
    status: { type: String, enum: ['ACTIVE', 'VOIDED'], default: 'ACTIVE' },
  },
  { timestamps: true },
)

// Supports fast lookup/search by name, plus the free-text search used by
// GET /patients?search=. patientNumber already gets a unique index for free
// from `unique: true` above.
patientSchema.index({ firstName: 'text', lastName: 'text', patientNumber: 'text', phone: 'text' })

export type PatientAttrs = InferSchemaType<typeof patientSchema>
export type PatientDoc = HydratedDocument<PatientAttrs>
export const Patient = model<PatientAttrs>('Patient', patientSchema)
