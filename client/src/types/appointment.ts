import type { Patient } from './patient'

// This matches server/src/models/Appointment.ts's APPOINTMENT_STATUSES
// exactly.
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

// When the doctor field is filled in, it only includes the fields listed in
// server/src/types/user.ts's PUBLIC_USER_FIELDS ('firstName lastName
// email'). It leaves out phone, role, and status, unlike the full AuthUser
// shape that /users returns. This type matches that limited shape exactly
// instead of reusing AuthUser.
export interface AppointmentDoctorRef {
  _id: string
  firstName: string
  lastName: string
  email: string
}

// GET /appointments fills in the patient and doctor fields differently
// depending on the caller's role. For example, see appointment.service.ts's
// listAppointments: a DOCTOR's own id isn't filled in on their own list,
// and a PATIENT's own patient record isn't filled in on theirs. Because of
// this, each of these fields could either be the full object or just the
// raw id string. Every screen that displays these fields needs to check
// which case it's dealing with — see the isPopulated() helper in
// lib/utils.ts.
export interface Appointment {
  _id: string
  appointmentNumber: string
  patient: Patient | string
  doctor: AppointmentDoctorRef | string
  date: string
  startTime: string
  endTime: string
  reason?: string
  status: AppointmentStatus
  // Links back to whichever Encounter the Nurse opened for this appointment
  // at check-in (see server/src/models/Appointment.ts's comment and
  // encounter.service.ts's createEncounter, which sets this once). It's
  // missing until an encounter exists, and it's always just a raw id, never
  // the full object.
  encounter?: string
  createdAt: string
}
