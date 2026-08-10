import { Patient } from '../models/Patient.js'
import { generateId } from '../utils/generateId.js'
import { AppError } from '../utils/apiResponse.js'
import type { BloodGroup } from '../types/patient.js'

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
  // `Number.isFinite` (not just `?? `) is required here: the controller
  // passes `Number(req.query.page)` straight through, and `Number("abc")`
  // is `NaN` — a "truthy-ish" value that `??` does NOT replace (only `null`/
  // `undefined` trigger `??`'s fallback). Without this check, garbage input
  // like `?page=abc` would flow through as NaN into `.skip()/.limit()`
  // below, which the MongoDB driver rejects with an uncaught error. Instead,
  // invalid/missing input quietly falls back to the same defaults as before.
  const page = Number.isFinite(opts.page) && opts.page! > 0 ? Math.floor(opts.page!) : 1
  const limit =
    Number.isFinite(opts.limit) && opts.limit! > 0
      ? Math.min(100, Math.floor(opts.limit!)) // cap page size to avoid huge unbounded queries
      : 20

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
