import type { Patient } from './patient'
import type { Department } from './department'
import type { AppointmentDoctorRef } from './appointment'

export const ENCOUNTER_STATUSES = ['IN_PROGRESS', 'COMPLETED'] as const
export type EncounterStatus = (typeof ENCOUNTER_STATUSES)[number]

// Both GET /encounters (list) and GET /encounters/:id (detail) always
// fully populate patient/doctor/department for every role (see
// encounter.service.ts's listEncounters and getEncounterById) — unlike
// Appointment, there's no role-dependent partial population here, so
// these are never raw id strings.
export interface Encounter {
  _id: string
  patient: Patient
  doctor: AppointmentDoctorRef
  department: Department
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

// The exact shape GET /encounters/:id returns — the encounter plus its
// vitals/diagnoses histories, queried separately rather than embedded (see
// the comment on getEncounterById in encounter.service.ts).
export interface EncounterDetail {
  encounter: Encounter
  vitals: VitalSign[]
  diagnoses: Diagnosis[]
}
