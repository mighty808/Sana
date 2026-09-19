import { Prescription } from '../models/Prescription.js'
import { Encounter } from '../models/Encounter.js'
import { Patient } from '../models/Patient.js'
import { Types } from 'mongoose'
import { generateId } from '../utils/generateId.js'
import { AppError, assertValidObjectId } from '../utils/apiResponse.js'
import { PUBLIC_USER_FIELDS, type AuthedUser } from '../types/user.js'
import { assertEncounterOpen } from './encounter.service.js'
import { scopeToOwnDoctor } from '../utils/queryScope.js'
import { getPatientForUser } from './patient.service.js'
import { notify } from './notification.service.js'

// Same pattern as ai.service.ts's fetchPatientLabel / referral.service.ts's
// own copy of it — a small "Name — " prefix for a notification message,
// not worth sharing a two-line helper across three files.
async function fetchPatientLabel(patientId: Types.ObjectId) {
  const patient = await Patient.findById(patientId).select('firstName lastName')
  return patient ? `${patient.firstName} ${patient.lastName} — ` : ''
}

interface MedicationInput {
  drugName: string
  dosage: string
  frequency: string
  duration: string
  instructions?: string
}

// Writes a prescription during an encounter — `patient` is worked out from
// the encounter, never taken from the request body, same reasoning as
// createLabOrder. Restricted to the assigned doctor only, the same
// ownership rule every other encounter sub-record write uses.
export async function createPrescription(encounterId: string, doctorId: string, medications: MedicationInput[]) {
  assertValidObjectId(encounterId, 'encounter')

  const encounter = await Encounter.findOne({ _id: encounterId, doctor: doctorId })
  if (!encounter) throw new AppError('Encounter not found', 404, 'ENCOUNTER_NOT_FOUND')
  assertEncounterOpen(encounter, 'write a prescription on')

  const prescriptionNumber = await generateId('RX')
  const prescription = await Prescription.create({
    prescriptionNumber,
    encounter: encounterId,
    patient: encounter.patient,
    doctor: doctorId,
    medications,
  })
  // Populated before returning for the same reason listPrescriptions does
  // it: the client's Prescription type promises `patient` and `doctor` are
  // full objects on EVERY endpoint that returns one, so a create response
  // has to honour that too. `encounter` deliberately stays a plain id —
  // the client type declares it as a string.
  return prescription.populate([{ path: 'patient' }, { path: 'doctor', select: PUBLIC_USER_FIELDS }])
}

// Lists prescriptions — this is the pharmacy queue.
//   - ADMIN, PHARMACIST: see every prescription. Pharmacist is the one
//     actually working the queue and dispensing; Admin keeps read-only oversight.
//   - DOCTOR: sees only the ones they personally wrote, the same
//     doctor-scoping used for lab orders/appointments/encounters.
//   - PATIENT: sees their own, the same pattern listLabResults uses.
//   - NURSE never reaches this function at all — it holds no
//     'prescription.read' permission (see types/permissions.ts), so the
//     route blocks it before this code runs.
export async function listPrescriptions(user: AuthedUser, statusFilter?: string) {
  // `patient`/`doctor` are always fully populated below, no matter which
  // branch — same "never a raw id" convention LabOrder's own list/detail
  // functions already follow, so the client's Prescription type never has
  // to handle two different shapes depending on who asked.
  if (user.role.name === 'PATIENT') {
    const patient = await getPatientForUser(user.id)
    if (!patient) return []
    return Prescription.find({ patient: patient.id })
      .populate([{ path: 'patient' }, { path: 'doctor', select: PUBLIC_USER_FIELDS }])
      .sort({ createdAt: -1 })
  }

  const filter: Record<string, unknown> = {}
  scopeToOwnDoctor(filter, user)
  if (statusFilter) filter.status = statusFilter

  return Prescription.find(filter)
    .populate([{ path: 'patient' }, { path: 'doctor', select: PUBLIC_USER_FIELDS }])
    .sort({ createdAt: -1 })
}

// Hands over a prescription's medications — a single atomic action (see
// models/Prescription.ts's comment on why there's no per-medication
// status), restricted to a prescription that's still PRESCRIBED so it can
// never be dispensed twice.
export async function dispensePrescription(prescriptionId: string, pharmacistId: string) {
  const prescription = await Prescription.findOne({ _id: prescriptionId, status: 'PRESCRIBED' })
  if (!prescription) {
    throw new AppError(
      'Prescription not found, or already dispensed/cancelled',
      409,
      'PRESCRIPTION_NOT_DISPENSABLE',
    )
  }

  prescription.status = 'DISPENSED'
  prescription.dispensedBy = new Types.ObjectId(pharmacistId)
  prescription.dispensedAt = new Date()
  await prescription.save()

  // Same shape as labResult.service.ts's releaseLabResult notification —
  // let the prescribing doctor know it's been filled.
  const patientLabel = await fetchPatientLabel(prescription.patient)
  await notify(prescription.doctor.toString(), {
    type: 'prescription.dispensed',
    title: 'Prescription dispensed',
    message: `${patientLabel}${prescription.prescriptionNumber} has been dispensed`,
    entityType: 'Prescription',
    entityId: prescription.id,
  })

  // Same always-populated contract as createPrescription above.
  return prescription.populate([{ path: 'patient' }, { path: 'doctor', select: PUBLIC_USER_FIELDS }])
}
