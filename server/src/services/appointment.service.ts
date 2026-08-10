import { Appointment, type AppointmentStatus } from '../models/Appointment.js'
import { Patient } from '../models/Patient.js'
import { User } from '../models/User.js'
import { Department } from '../models/Department.js'
import { generateId } from '../utils/generateId.js'
import { AppError, assertValidObjectId } from '../utils/apiResponse.js'
import { PUBLIC_USER_FIELDS, type AuthedUser } from '../types/user.js'

interface CreateAppointmentInput {
  patient: string
  doctor: string
  department: string
  date: Date
  startTime: string
  endTime: string
  reason?: string
}

// Books a new appointment. Validates that the referenced patient/doctor/
// department actually exist (and that `doctor` really is a user with the
// DOCTOR role) BEFORE writing, so a typo'd id produces a clean 404 instead
// of an appointment silently pointing at nothing.
export async function createAppointment(input: CreateAppointmentInput) {
  assertValidObjectId(input.patient, 'patient')
  assertValidObjectId(input.doctor, 'doctor')
  assertValidObjectId(input.department, 'department')

  // Run the three existence checks concurrently — they're independent of
  // each other, same reasoning as user.service.ts's createUser.
  const [patient, doctor, department] = await Promise.all([
    Patient.findOne({ _id: input.patient, status: 'ACTIVE' }),
    User.findById(input.doctor).populate('role'),
    Department.findOne({ _id: input.department, status: 'ACTIVE' }),
  ])

  if (!patient) throw new AppError('Patient not found', 404, 'PATIENT_NOT_FOUND')
  if (!doctor) throw new AppError('Doctor not found', 404, 'DOCTOR_NOT_FOUND')
  if ((doctor.role as unknown as { name: string })?.name !== 'DOCTOR') {
    throw new AppError('That user is not a doctor', 400, 'NOT_A_DOCTOR')
  }
  if (!department) throw new AppError('Department not found', 404, 'DEPARTMENT_NOT_FOUND')

  const appointmentNumber = await generateId('APT')
  return Appointment.create({ ...input, appointmentNumber })
}

// Lists appointments, filtered according to the requesting user's role —
// this is what the blueprint's "GET /appointments List (filtered by role)"
// requirement means in practice:
//   - ADMIN, NURSE: see every appointment (no ward/department scoping in the MVP).
//   - DOCTOR: sees only appointments where they are the assigned doctor.
//   - PATIENT: sees only appointments belonging to their own linked Patient
//     record (via Patient.user — see models/Patient.ts). If a patient-role
//     account has no linked Patient record yet, they simply see an empty list.
export async function listAppointments(user: AuthedUser) {
  const roleName = user.role.name
  // `doctor` is always restricted to PUBLIC_USER_FIELDS below — a plain
  // `.populate('doctor')` would embed the doctor's entire User document
  // (including passwordHash) into every appointment in the response.

  if (roleName === 'DOCTOR') {
    return Appointment.find({ doctor: user.id }).populate('patient department').sort({ date: -1 })
  }

  if (roleName === 'PATIENT') {
    const patient = await Patient.findOne({ user: user.id })
    if (!patient) return []
    return Appointment.find({ patient: patient.id })
      .populate([{ path: 'doctor', select: PUBLIC_USER_FIELDS }, { path: 'department' }])
      .sort({ date: -1 })
  }

  // ADMIN and NURSE.
  return Appointment.find()
    .populate([{ path: 'patient' }, { path: 'doctor', select: PUBLIC_USER_FIELDS }, { path: 'department' }])
    .sort({ date: -1 })
}

// Updates an appointment's status (e.g. BOOKED -> CHECKED_IN -> COMPLETED).
// Deliberately does NOT enforce a strict state-machine of allowed
// transitions for the MVP — any value from the enum is accepted, matching
// how loosely the blueprint's own demo workflow moves between states.
// A stricter transition graph is easy to add later (in one place, here)
// if the real clinical workflow needs it enforced.
export async function updateAppointmentStatus(id: string, status: AppointmentStatus) {
  const appointment = await Appointment.findByIdAndUpdate(id, { status }, { returnDocument: 'after' })
  if (!appointment) throw new AppError('Appointment not found', 404, 'APPOINTMENT_NOT_FOUND')
  return appointment
}
