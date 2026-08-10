import { Patient } from '../models/Patient.js'
import { generateId } from '../utils/generateId.js'
import { AppError } from '../utils/apiResponse.js'
import { resolvePagination } from '../utils/pagination.js'
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
  const { page, limit, skip } = resolvePagination(opts)

  const filter: Record<string, unknown> = { status: 'ACTIVE' }
  if (opts.search) {
    filter.$text = { $search: opts.search }
  }

  const [patients, total] = await Promise.all([
    Patient.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
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

// Finds the Patient record linked to a given login account, if one exists
// (via Patient.user — see the field's comment on models/Patient.ts). Used
// everywhere a PATIENT-role caller needs their own patient identity resolved
// before filtering a query to "their own" records — appointments, lab
// results, and invoices all had this exact lookup duplicated verbatim
// before being consolidated into this one shared helper.
export async function getPatientForUser(userId: string) {
  return Patient.findOne({ user: userId })
}
