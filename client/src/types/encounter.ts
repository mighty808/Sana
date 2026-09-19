import type { Patient } from './patient'
import type { AppointmentDoctorRef } from './appointment'
import type { AiAcuityLevel } from './aiConsultation'
import type { Referral } from './referral'
import type { Prescription } from './prescription'

export const ENCOUNTER_STATUSES = ['IN_PROGRESS', 'COMPLETED'] as const
export type EncounterStatus = (typeof ENCOUNTER_STATUSES)[number]

// Both GET /encounters (list) and GET /encounters/:id (detail) always fill
// in the full patient and doctor objects for every role (see
// encounter.service.ts's listEncounters and getEncounterById). Unlike
// Appointment, there's no case here where these come back as raw id
// strings.
export interface Encounter {
  _id: string
  patient: Patient
  doctor: AppointmentDoctorRef
  appointment?: string
  chiefComplaint: string
  history?: string
  clinicalNotes?: string
  status: EncounterStatus
  startedAt: string
  completedAt?: string
}

export interface VitalSign {
  _id: string
  encounter: string
  patient: string
  recordedBy: string
  temperature?: number
  heartRate?: number
  respiratoryRate?: number
  systolicBp?: number
  diastolicBp?: number
  oxygenSaturation?: number
  weight?: number
  height?: number
  recordedAt: string
}

export interface Diagnosis {
  _id: string
  encounter: string
  patient: string
  doctor: string
  diagnosis: string
  diagnosisCode?: string
  notes?: string
  createdAt: string
}

// One row of GET /encounters/ward-board — a trimmed-down Encounter plus
// whatever the most recent acuity-bearing AiConsultation on it said, if any
// exist yet (see encounter.service.ts's getWardBoard). acuityLevel is
// undefined for an encounter nobody has run the nurse's AI Analysis on.
export interface WardBoardEntry {
  _id: string
  patient: Pick<Patient, '_id' | 'firstName' | 'lastName' | 'patientNumber'>
  doctor: AppointmentDoctorRef
  chiefComplaint: string
  startedAt: string
  acuityLevel?: AiAcuityLevel
  acuityReasons?: string[]
  assessedAt?: string
}

// This is the exact shape GET /encounters/:id returns: the encounter plus
// its vitals, diagnoses, referral, and prescription history, which are
// fetched as separate queries rather than being embedded directly in the
// encounter (see the comment on getEncounterById in encounter.service.ts).
export interface EncounterDetail {
  encounter: Encounter
  vitals: VitalSign[]
  diagnoses: Diagnosis[]
  referrals: Referral[]
  prescriptions: Prescription[]
}
