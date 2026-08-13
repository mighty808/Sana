import type { Patient } from './patient'
import type { Department } from './department'

// Mirrors server/src/models/Appointment.ts's APPOINTMENT_STATUSES exactly.
export const APPOINTMENT_STATUSES = [
  'BOOKED',
  'CONFIRMED',
  'CHECKED_IN',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
] as const
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number]

// The doctor field, when populated, is restricted to
// server/src/types/user.ts's PUBLIC_USER_FIELDS ('firstName lastName
// email') — no phone/role/status, unlike the full AuthUser shape /users
// returns. Matched exactly rather than reusing AuthUser for this.
export interface AppointmentDoctorRef {
  _id: string
  firstName: string
  lastName: string
  email: string
}

// GET /appointments populates patient/doctor/department DIFFERENTLY
// depending on the caller's role (see appointment.service.ts's
// listAppointments — a DOCTOR's own id isn't re-populated on their own
// list, a PATIENT's own patient record isn't re-populated on theirs), so
// each of these three fields is either the populated object or just the
// raw ObjectId string. Every screen that renders these must check which
// case it's in — see the isPopulated() helper in lib/utils.ts.
export interface Appointment {
  _id: string
  appointmentNumber: string
  patient: Patient | string
  doctor: AppointmentDoctorRef | string
  department: Department | string
  date: string
  startTime: string
  endTime: string
  reason?: string
  status: AppointmentStatus
  // Reverse link to whichever Encounter the Nurse opened for this
  // appointment at check-in (see server/src/models/Appointment.ts's comment
  // and encounter.service.ts's createEncounter, which writes this once).
  // Absent until an encounter exists; never populated, always a raw id.
  encounter?: string
  createdAt: string
}
