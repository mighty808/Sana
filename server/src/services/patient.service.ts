import { Patient, type PatientDoc } from '../models/Patient.js'
import { generateId } from '../utils/generateId.js'
import { AppError } from '../utils/apiResponse.js'

// Same literal union as the `bloodGroup` enum on the Patient schema — kept
// in sync manually since Mongoose doesn't export enum types automatically.
type BloodGroup = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-' | 'UNKNOWN'

// Shape accepted for both creating and updating a patient — matches the Zod
// schemas in schemas/patient.ts (which validate this before it reaches here).
interface PatientInput {
  firstName: string
  lastName: string
  dob: Date
  gender: 'MALE' | 'FEMALE' | 'OTHER'
  phone?: string
  email?: string
  address?: string
  bloodGroup?: BloodGroup
  emergencyContact?: { name?: string; phone?: string }
}

// Registers a new patient. Generates the human-readable patientNumber
// (e.g. "SAN-2026-00001") here rather than in the model, so the sequence
// logic (utils/generateId.ts) stays reusable for other id types
// (appointments, invoices) added in later phases.
export async function createPatient(input: PatientInput) {
  const patientNumber = await generateId('SAN')
  return Patient.create({ ...input, patientNumber })
}

// Searches/lists patients with pagination. `search` (if provided) matches
// against the text index defined on the Patient schema (name, patientNumber,
// phone). VOIDED (soft-deleted) patients are excluded unless explicitly requested.
export async function searchPatients(opts: { search?: string; page?: number; limit?: number }) {
  const page = Math.max(1, opts.page ?? 1)
  const limit = Math.min(100, Math.max(1, opts.limit ?? 20)) // cap page size to avoid huge unbounded queries

  const filter: Record<string, unknown> = { status: 'ACTIVE' }
  if (opts.search) {
    filter.$text = { $search: opts.search }
  }

  const [patients, total] = await Promise.all([
    Patient.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Patient.countDocuments(filter),
  ])

  return { patients, total, page, limit, pages: Math.ceil(total / limit) }
}

// Fetches one patient by MongoDB _id. Throws a 404 AppError if not found
// (or was soft-deleted) so controllers don't need their own null-check + 404 logic.
export async function getPatientById(id: string) {
  const patient = await Patient.findOne({ _id: id, status: 'ACTIVE' })
  if (!patient) throw new AppError('Patient not found', 404, 'PATIENT_NOT_FOUND')
  return patient
}

// Applies a partial update to an existing patient record.
export async function updatePatient(id: string, updates: Partial<PatientInput>) {
  const patient = await Patient.findOneAndUpdate({ _id: id, status: 'ACTIVE' }, updates, {
    returnDocument: 'after',
  })
  if (!patient) throw new AppError('Patient not found', 404, 'PATIENT_NOT_FOUND')
  return patient
}
