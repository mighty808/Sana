// Mirrors server/src/types/patient.ts's BLOOD_GROUPS exactly.
export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'UNKNOWN'] as const
export type BloodGroup = (typeof BLOOD_GROUPS)[number]

export type Gender = 'MALE' | 'FEMALE' | 'OTHER'

// Matches the Patient document shape server/src/models/Patient.ts returns
// (minus Mongoose-internal fields) — every field the patient list/detail
// screens need, nothing invented.
// NOTE: patient.controller.ts returns the raw Mongoose document (not run
// through a toPublicUser()-style mapper the way /users is), so this comes
// back as `_id`, not `id` — matched exactly here rather than assuming the
// same normalization every other endpoint in this app happens to have.
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

// The exact shape server/src/utils/pagination.ts's callers return — shared
// across every paginated list endpoint (patients today, others later).
export interface PaginatedResult<T> {
  total: number
  page: number
  limit: number
  pages: number
  items: T[]
}

// searchPatients() returns its array under `patients`, not the generic
// `items` name — matched exactly rather than renamed, since the frontend
// should mirror the backend's actual response shape.
export interface PatientSearchResult extends Omit<PaginatedResult<Patient>, 'items'> {
  patients: Patient[]
}

// GET /patients/:id/timeline's response shape — appointments/encounters/
// labOrders/invoices are empty-array placeholders on the backend until
// their respective build steps land (see patient.controller.ts's timeline
// handler comment), so this type reflects that they exist but are
// currently always empty rather than pretending they're populated.
export interface PatientTimeline {
  patient: Patient
  appointments: unknown[]
  encounters: unknown[]
  labOrders: unknown[]
  invoices: unknown[]
}
