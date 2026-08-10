import { Encounter } from '../models/Encounter.js'
import { VitalSign } from '../models/VitalSign.js'
import { Diagnosis } from '../models/Diagnosis.js'
import { Patient } from '../models/Patient.js'
import { Department } from '../models/Department.js'
import { Appointment } from '../models/Appointment.js'
import { AppError, assertValidObjectId } from '../utils/apiResponse.js'
import { PUBLIC_USER_FIELDS } from '../types/user.js'

interface CreateEncounterInput {
  patient: string
  department: string
  appointment?: string
  chiefComplaint: string
  history?: string
}

// Opens a new encounter — the actual clinical record of a visit. Called by
// a doctor, who becomes the encounter's `doctor`. Validates the referenced
// patient/department (and appointment, if given) exist before writing.
export async function createEncounter(input: CreateEncounterInput, doctorId: string) {
  assertValidObjectId(input.patient, 'patient')
  assertValidObjectId(input.department, 'department')
  if (input.appointment) assertValidObjectId(input.appointment, 'appointment')

  const [patient, department, appointment] = await Promise.all([
    Patient.findOne({ _id: input.patient, status: 'ACTIVE' }),
    Department.findOne({ _id: input.department, status: 'ACTIVE' }),
    input.appointment ? Appointment.findById(input.appointment) : Promise.resolve(undefined),
  ])

  if (!patient) throw new AppError('Patient not found', 404, 'PATIENT_NOT_FOUND')
  if (!department) throw new AppError('Department not found', 404, 'DEPARTMENT_NOT_FOUND')
  if (input.appointment && !appointment) {
    throw new AppError('Appointment not found', 404, 'APPOINTMENT_NOT_FOUND')
  }

  return Encounter.create({
    patient: input.patient,
    department: input.department,
    appointment: input.appointment,
    chiefComplaint: input.chiefComplaint,
    history: input.history,
    doctor: doctorId,
  })
}

// Fetches one encounter with its full clinical context: the vitals and
// diagnoses recorded against it so far. Those live in their own collections
// (see models/VitalSign.ts, models/Diagnosis.ts) rather than embedded here,
// so they're queried alongside the encounter rather than populated on it.
export async function getEncounterById(id: string) {
  const [encounter, vitals, diagnoses] = await Promise.all([
    // `doctor` is restricted to PUBLIC_USER_FIELDS — a plain
    // `.populate('doctor')` would embed the doctor's ENTIRE User document,
    // including passwordHash, into this response.
    Encounter.findById(id).populate([
      { path: 'patient' },
      { path: 'doctor', select: PUBLIC_USER_FIELDS },
      { path: 'department' },
      { path: 'appointment' },
    ]),
    VitalSign.find({ encounter: id }).sort({ recordedAt: 1 }),
    Diagnosis.find({ encounter: id }).sort({ createdAt: 1 }),
  ])

  if (!encounter) throw new AppError('Encounter not found', 404, 'ENCOUNTER_NOT_FOUND')
  return { encounter, vitals, diagnoses }
}

interface VitalsInput {
  temperature?: number
  heartRate?: number
  respiratoryRate?: number
  systolicBp?: number
  diastolicBp?: number
  oxygenSaturation?: number
  weight?: number
  height?: number
}

// Records one set of vitals against an encounter — typically done by a Nurse.
export async function addVitals(encounterId: string, recordedBy: string, input: VitalsInput) {
  const encounter = await Encounter.findById(encounterId)
  if (!encounter) throw new AppError('Encounter not found', 404, 'ENCOUNTER_NOT_FOUND')

  return VitalSign.create({
    ...input,
    encounter: encounterId,
    patient: encounter.patient,
    recordedBy,
  })
}

interface DiagnosisInput {
  diagnosis: string
  diagnosisCode?: string
  notes?: string
}

// Adds a diagnosis to an encounter — done by the doctor running the encounter.
export async function addDiagnosis(encounterId: string, doctorId: string, input: DiagnosisInput) {
  const encounter = await Encounter.findById(encounterId)
  if (!encounter) throw new AppError('Encounter not found', 404, 'ENCOUNTER_NOT_FOUND')

  return Diagnosis.create({
    ...input,
    encounter: encounterId,
    patient: encounter.patient,
    doctor: doctorId,
  })
}
