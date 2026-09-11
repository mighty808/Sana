import type { Patient } from './patient'
import type { AppointmentDoctorRef } from './appointment'

export const PRESCRIPTION_STATUSES = ['PRESCRIBED', 'DISPENSED', 'CANCELLED'] as const
export type PrescriptionStatus = (typeof PRESCRIPTION_STATUSES)[number]

export interface MedicationItem {
  drugName: string
  dosage: string
  frequency: string
  duration: string
  instructions?: string
}

// listPrescriptions() always fills in the full patient object and the
// doctor's public fields, no matter what role is calling — same
// convention as LabOrder. There's no case here where these come back as
// raw id strings.
export interface Prescription {
  _id: string
  prescriptionNumber: string
  encounter: string
  patient: Patient
  doctor: AppointmentDoctorRef
  medications: MedicationItem[]
  status: PrescriptionStatus
  dispensedBy?: string
  dispensedAt?: string
  createdAt: string
}
