import type { Encounter } from './encounter'
import type { LabOrder } from './labOrder'
import type { Invoice } from './invoice'
import type { Prescription } from './prescription'

// This matches server/src/types/patient.ts's BLOOD_GROUPS exactly.
export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'UNKNOWN'] as const
export type BloodGroup = (typeof BLOOD_GROUPS)[number]

export type Gender = 'MALE' | 'FEMALE' | 'OTHER'

// This matches the Patient document shape that server/src/models/Patient.ts
// returns, minus Mongoose's internal fields. It includes every field the
// patient list and detail screens need, and nothing extra.
// NOTE: patient.controller.ts returns the raw Mongoose document, unlike
// /users, which runs its data through a toPublicUser()-style mapper first.
// Because of that, this comes back as `_id`, not `id`. This type matches
// that exactly rather than assuming the same field naming that other
// endpoints in this app happen to use.
export interface Patient {
  _id: string
  patientNumber: string
  firstName: string
  lastName: string
  dob: string
  gender: Gender
  phone?: string
  email?: string
  address?: string
  bloodGroup?: BloodGroup
  emergencyContact?: { name?: string; phone?: string }
  status: 'ACTIVE' | 'VOIDED'
  createdAt: string
}

// This is the exact shape returned by anything using
// server/src/utils/pagination.ts, shared across every paginated list
// endpoint (patients today, and possibly others later).
export interface PaginatedResult<T> {
  total: number
  page: number
  limit: number
  pages: number
  items: T[]
}

// searchPatients() returns its array under the field name `patients`, not
// the generic `items` name. This type keeps that same field name rather
// than renaming it, since the frontend should mirror the backend's actual
// response shape.
export interface PatientSearchResult extends Omit<PaginatedResult<Patient>, 'items'> {
  patients: Patient[]
}

// This is the response shape of GET /patients/:id/timeline: every
// encounter, lab order, invoice, and prescription tied to this patient
// (see patient.service.ts's getPatientTimeline). `labOrders`/`prescriptions`
// always have the full doctor and patient objects filled in, the same way
// their own list endpoints do. `invoices` follows the same "full object or
// just the id" pattern as Invoice's own `patient` field. `encounters` only
// fills in `doctor` — its `patient` field is deliberately left as a raw id
// here, unlike Encounter's own dedicated endpoints, which always fill it
// in. That's because filling it in here would just repeat the `patient`
// field that's already at the top level of this whole response, so
// there's no need to read it off each individual encounter.
export interface PatientTimeline {
  patient: Patient
  encounters: Array<Omit<Encounter, 'patient'> & { patient: string }>
  labOrders: LabOrder[]
  invoices: Invoice[]
  prescriptions: Prescription[]
}
