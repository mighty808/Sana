import { Patient } from '../models/Patient.js'
import { Encounter } from '../models/Encounter.js'
import { LabOrder } from '../models/LabOrder.js'
import { Invoice } from '../models/Invoice.js'
import { Prescription } from '../models/Prescription.js'
import { generateId } from '../utils/generateId.js'
import { AppError } from '../utils/apiResponse.js'
import { resolvePagination } from '../utils/pagination.js'
import type { BloodGroup } from '../types/patient.js'
import { PUBLIC_USER_FIELDS } from '../types/user.js'
import type { AuthedUser } from '../types/user.js'
import { asPopulated } from '../utils/populate.js'

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

// Whether this doctor has ever had an encounter with this patient — the
// one relationship check that decides whether a doctor can reach a
// specific patient's record. Used directly below by getPatientById.
// searchPatients needs the same relationship but as a bulk filter across
// many patients at once (Encounter.distinct + $in, not a per-patient
// exists check), and getPatientTimeline derives it from the encounters it
// already fetches for its own response rather than a second Encounter
// query — both intentionally don't call this, since doing so would make
// one slower (a query per patient in a loop) or the other redundant (a
// second round trip to data already in hand). If this relationship rule
// ever changes, all three call sites still need updating together.
async function doctorHasEncounterWith(doctorId: string, patientId: string): Promise<boolean> {
  return Boolean(await Encounter.exists({ patient: patientId, doctor: doctorId }))
}

// Registers a new patient. The human-readable patientNumber (something
// like "SAN-2026-00001") is generated here, not inside the model, so that
// same numbering logic (utils/generateId.ts) can also be reused for other
// kinds of ids — appointments and invoices use it too.
export async function createPatient(input: PatientInput) {
  const patientNumber = await generateId('SAN')
  return Patient.create({ ...input, patientNumber })
}

// Searches or lists patients, with pagination. If `search` is given, it
// matches against the text index on the Patient schema — name,
// patientNumber, and phone. Voided (soft-deleted) patients are always
// excluded. A doctor only sees patients they have at least one encounter
// with, of any status. Admin and Nurse both see the full patient
// directory, unrestricted, since registering and overseeing patients
// isn't tied to one specific clinical relationship the way it is for a doctor.
export async function searchPatients(
  opts: { search?: string; page?: number; limit?: number },
  requestingUser?: AuthedUser,
) {
  const { page, limit, skip } = resolvePagination(opts)

  const filter: Record<string, unknown> = { status: 'ACTIVE' }
  if (opts.search) {
    filter.$text = { $search: opts.search }
  }
  if (requestingUser?.role.name === 'DOCTOR') {
    const patientIds = await Encounter.distinct('patient', { doctor: requestingUser.id })
    filter._id = { $in: patientIds }
  }

  const [patients, total] = await Promise.all([
    Patient.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Patient.countDocuments(filter),
  ])

  return { patients, total, page, limit, pages: Math.ceil(total / limit) }
}

// Fetches one patient by their database id. Throws a 404 if the patient
// doesn't exist or was soft-deleted, so controllers don't each need their
// own null-check-then-404 logic. This applies the same doctor scoping as
// searchPatients — without it, a doctor could just look up any patient
// directly by id, and the scoping on the list view above would only be
// cosmetic. If a doctor requests a patient they have no relationship
// with, this reports the same "not found" 404 as a genuinely missing
// patient, rather than a 403 — that way it never confirms to the doctor
// that the patient exists at all.
export async function getPatientById(id: string, requestingUser?: AuthedUser) {
  if (requestingUser?.role.name === 'DOCTOR') {
    if (!(await doctorHasEncounterWith(requestingUser.id, id))) {
      throw new AppError('Patient not found', 404, 'PATIENT_NOT_FOUND')
    }
  }
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

// Fetches a patient along with their full history — every encounter, lab
// order, and invoice tied to them — for the patient detail page. It
// queries the three history collections directly, rather than going
// through each one's own list function, because those list functions are
// built around each role's own queue (a doctor's own encounters, a lab
// tech's own queue) — this instead needs everything tied to one specific
// patient, regardless of who's asking.
//
// This doesn't call getPatientById — that function's own doctor-scoping
// check runs a separate `Encounter.exists({patient, doctor})` query purely
// to authorize, which here would mean an extra sequential round trip to
// the same Encounter collection this function is about to query anyway
// for the timeline itself. Instead, the same "not found" scoping is
// derived from the encounters just fetched below: if a doctor has none of
// their own encounters with this patient, they have no relationship to
// them, which is exactly what getPatientById's check also means.
export async function getPatientTimeline(id: string, requestingUser: AuthedUser) {
  const patient = await Patient.findOne({ _id: id, status: 'ACTIVE' })
  if (!patient) throw new AppError('Patient not found', 404, 'PATIENT_NOT_FOUND')

  // This endpoint is gated only by 'patient.read' (see patient.routes.ts),
  // which Doctor and Nurse both hold — but neither holds 'invoice.read',
  // and invoice.service.ts's own listInvoices comment is explicit that
  // Doctor/Nurse have no billing visibility at all. So the invoices query
  // only runs for a requester who actually holds 'invoice.read', the same
  // permission GET /invoices itself requires — otherwise this timeline
  // would leak every patient's full billing history to any Doctor or Nurse.
  const canSeeInvoices = requestingUser.role.permissions.includes('invoice.read')

  const [encounters, labOrders, invoices, prescriptions] = await Promise.all([
    Encounter.find({ patient: id })
      .populate({ path: 'doctor', select: PUBLIC_USER_FIELDS })
      .sort({ startedAt: -1 }),
    // Populated the same way listLabOrders() and getLabOrderById() always
    // are, since the frontend's LabOrder type expects patient and doctor
    // to always be full objects, never raw ids, no matter which endpoint
    // returned them.
    LabOrder.find({ patient: id })
      .populate([{ path: 'patient' }, { path: 'doctor', select: PUBLIC_USER_FIELDS }])
      .sort({ orderedAt: -1 }),
    canSeeInvoices ? Invoice.find({ patient: id }).sort({ createdAt: -1 }) : Promise.resolve([]),
    Prescription.find({ patient: id })
      .populate([{ path: 'patient' }, { path: 'doctor', select: PUBLIC_USER_FIELDS }])
      .sort({ createdAt: -1 }),
  ])

  if (requestingUser.role.name === 'DOCTOR') {
    // `?.` guards against a genuinely deleted/orphaned doctor reference —
    // same reasoning as invoice.service.ts's getInvoiceById guard on
    // asPopulated(invoice.patient). Without it, one bad encounter record
    // would throw and 500 the whole timeline instead of just not counting
    // as "this doctor's patient."
    const hasEncounter = encounters.some((e) => asPopulated<{ id: string } | null>(e.doctor)?.id === requestingUser.id)
    if (!hasEncounter) throw new AppError('Patient not found', 404, 'PATIENT_NOT_FOUND')
  }

  return { patient, encounters, labOrders, invoices, prescriptions }
}

// Finds the Patient record linked to a given login account, if one
// exists (through Patient.user — see models/Patient.ts). This gets used
// everywhere a patient needs their own patient identity resolved before a
// query can be filtered down to just their own records — appointments,
// lab results, and invoices all needed this same lookup, so it lives here once.
export async function getPatientForUser(userId: string) {
  return Patient.findOne({ user: userId })
}
