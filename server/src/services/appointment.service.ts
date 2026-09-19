import { Appointment, type AppointmentStatus } from '../models/Appointment.js'
import { Patient } from '../models/Patient.js'
import { User } from '../models/User.js'
import { generateId } from '../utils/generateId.js'
import { AppError, assertValidObjectId } from '../utils/apiResponse.js'
import { PUBLIC_USER_FIELDS, type AuthedUser } from '../types/user.js'
import { notify } from './notification.service.js'
import { getPatientForUser } from './patient.service.js'
import { scopeToOwnDoctor } from '../utils/queryScope.js'

interface CreateAppointmentInput {
  patient: string
  doctor: string
  date: Date
  startTime: string
  endTime: string
  reason?: string
}

// Appointment statuses that no longer occupy a real slot on the doctor's
// schedule — excluded from the double-booking check below, since a
// cancelled or no-show appointment shouldn't block booking that same slot again.
const NON_BLOCKING_STATUSES: AppointmentStatus[] = ['CANCELLED', 'NO_SHOW']

// Books a new appointment. Only a nurse holds 'appointment.create' (see
// permissions.ts) — a nurse isn't a doctor herself, so `doctor` here is
// an id she picks from the doctor list (GET /users/doctors), unlike
// Encounter's doctor field, which is always worked out automatically
// rather than picked by hand. Because this id comes from the client, it
// has to be checked for real here: this is what actually confirms the id
// exists and really does belong to an active doctor, not just some other
// kind of user.
export async function createAppointment(input: CreateAppointmentInput) {
  assertValidObjectId(input.patient, 'patient')
  assertValidObjectId(input.doctor, 'doctor')
  // startTime < endTime is enforced by createAppointmentSchema's .refine()
  // (schemas/appointment.ts) before this function ever runs.

  const [patient, doctor] = await Promise.all([
    Patient.findOne({ _id: input.patient, status: 'ACTIVE' }),
    User.findOne({ _id: input.doctor, status: 'ACTIVE' }).populate('role'),
  ])

  if (!patient) throw new AppError('Patient not found', 404, 'PATIENT_NOT_FOUND')
  if (!doctor) throw new AppError('Doctor not found', 404, 'DOCTOR_NOT_FOUND')
  if ((doctor.role as unknown as { name: string })?.name !== 'DOCTOR') {
    throw new AppError('That user is not a doctor', 400, 'NOT_A_DOCTOR')
  }

  // Reject double-booking: any existing (non-cancelled/no-show) appointment
  // for this doctor on this date whose [startTime, endTime) range overlaps
  // the requested one. Two ranges overlap iff each starts before the other ends.
  const conflict = await Appointment.findOne({
    doctor: input.doctor,
    date: input.date,
    status: { $nin: NON_BLOCKING_STATUSES },
    startTime: { $lt: input.endTime },
    endTime: { $gt: input.startTime },
  })
  if (conflict) {
    throw new AppError(
      `Doctor already has an appointment (${conflict.appointmentNumber}) in that time slot`,
      409,
      'APPOINTMENT_CONFLICT',
    )
  }

  const appointmentNumber = await generateId('APT')
  const appointment = await Appointment.create({ ...input, appointmentNumber })

  // The assigned doctor gets a live notification, and a persisted one
  // they'll see in GET /notifications, the moment a nurse books an
  // appointment on their behalf — since the doctor isn't the one doing
  // the booking themselves, this is how they find out about it.
  await notify(input.doctor, {
    type: 'appointment.created',
    title: 'New appointment booked',
    message: `${patient.firstName} ${patient.lastName} — ${appointment.appointmentNumber} on ${appointment.date.toDateString()} at ${appointment.startTime}`,
    entityType: 'Appointment',
    entityId: appointment.id,
  })

  return appointment
}

// Lists appointments, filtered by the requesting user's role:
//   - Admin, Nurse: see every appointment.
//   - Doctor: sees only appointments where they're the assigned doctor.
//   - Patient: sees only appointments belonging to their own linked
//     Patient record (through Patient.user — see models/Patient.ts). If a
//     patient account has no linked Patient record yet, they just see an empty list.
export async function listAppointments(user: AuthedUser) {
  const roleName = user.role.name
  // `doctor` is always restricted to just its public fields below — a
  // plain `.populate('doctor')` with no field restriction would embed the
  // doctor's entire User document, password hash included, into every
  // appointment in the response.

  if (roleName === 'DOCTOR') {
    return Appointment.find({ doctor: user.id }).populate('patient').sort({ date: -1 })
  }

  if (roleName === 'PATIENT') {
    const patient = await getPatientForUser(user.id)
    if (!patient) return []
    return Appointment.find({ patient: patient.id })
      .populate({ path: 'doctor', select: PUBLIC_USER_FIELDS })
      .sort({ date: -1 })
  }

  // ADMIN and NURSE.
  return Appointment.find()
    .populate([{ path: 'patient' }, { path: 'doctor', select: PUBLIC_USER_FIELDS }])
    .sort({ date: -1 })
}

// Updates an appointment's status — for example, from BOOKED to
// CHECKED_IN to COMPLETED. There's no strict rule here about which status
// can follow which; any value from the enum is accepted. A stricter set
// of allowed transitions would be easy to add later, in this one place,
// if the real clinical workflow ever needs it enforced.
//
// A doctor can only update appointments where they're the assigned
// doctor — matching how listAppointments() already limits a doctor's
// view to their own appointments. Letting a doctor see only their own
// appointments but modify anyone's would be an inconsistent, real gap in
// access control. Admin has no such restriction. If a doctor's own filter
// matches nothing, this reports a plain 404 rather than a 403 — telling
// them "not yours" instead of "doesn't exist" would reveal that some
// other appointment they have no business knowing about actually exists.
export async function updateAppointmentStatus(id: string, status: AppointmentStatus, requestingUser: AuthedUser) {
  const filter: Record<string, unknown> = { _id: id }
  scopeToOwnDoctor(filter, requestingUser)

  const appointment = await Appointment.findOneAndUpdate(filter, { status }, { returnDocument: 'after' })
  if (!appointment) throw new AppError('Appointment not found', 404, 'APPOINTMENT_NOT_FOUND')
  return appointment
}
