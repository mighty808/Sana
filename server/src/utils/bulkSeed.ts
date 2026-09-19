// Generates realistic-looking bulk demo data on top of the roles and single
// test account per role that utils/seed.ts already creates. The goal is to
// have enough patients, appointments, encounters, and lab orders that demos
// and screenshots show a real, varied-looking database instead of a nearly
// empty one with just a handful of accounts and one patient.
//
// This writes directly through the Mongoose models instead of going through
// the service layer (appointment.service.ts's createAppointment, etc.) on
// purpose. Those service functions do extra things that make sense for a
// live HTTP request, such as conflict checks, notifications, and audit logs,
// but those extra steps don't make sense when generating hundreds of
// historical records all at once offline.

import type { Types } from 'mongoose'
import { User, type UserDoc } from '../models/User.js'
import { Role } from '../models/Role.js'
import { Patient, type PatientDoc } from '../models/Patient.js'
import { Appointment, type AppointmentStatus } from '../models/Appointment.js'
import { Encounter } from '../models/Encounter.js'
import { VitalSign } from '../models/VitalSign.js'
import { LabOrder } from '../models/LabOrder.js'
import { generateId } from './generateId.js'
import { hashPassword } from '../services/auth.service.js'
import { logger } from './logger.js'
import {
  CHIEF_COMPLAINTS,
  LAB_TEST_NAMES,
  randomInt,
  randomFrom,
  randomGhanaPhone,
  randomGender,
  randomName,
  randomDob,
  randomPastDate,
  randomDateAround,
  randomTimeSlot,
  addMinutes,
} from './seedData.js'

// Same password as the named test accounts (amaadmin@sana.test etc.) — fine
// for bulk fictional demo data, never use a fixed password like this for
// real accounts.
const BULK_PASSWORD = 'Password123!'

// Creates `count` additional staff users of the given role, skipping over
// any name that's already been used. It retries up to a small cap, but with
// roughly 400 possible name combinations per gender, it's never realistically
// going to run out of attempts for the small number of extra doctors/nurses
// needed here.
async function createStaffBatch(
  roleId: Types.ObjectId,
  count: number,
  existingEmails: Set<string>,
): Promise<UserDoc[]> {
  const passwordHash = await hashPassword(BULK_PASSWORD)
  const created: UserDoc[] = []

  let attempts = 0
  while (created.length < count && attempts < count * 10) {
    attempts++
    const gender = randomGender()
    const { firstName, lastName } = randomName(gender)
    const email = `dr.${firstName.toLowerCase()}.${lastName.toLowerCase()}@sana.test`
    if (existingEmails.has(email)) continue

    const user = await User.create({
      email,
      passwordHash,
      firstName,
      lastName,
      phone: randomGhanaPhone(),
      role: roleId,
    })
    existingEmails.add(email)
    created.push(user)
  }

  return created
}

export async function seedBulkClinicalData() {
  // If bulk data already looks like it's present, skip this entirely.
  // Re-running `npm run seed` in dev shouldn't keep multiplying hundreds of
  // records every time. 20 is comfortably more than the handful of patients
  // created by manual testing, but well below the 50+ patients this function
  // creates, so it's a safe threshold for "has this already run."
  const existingPatientCount = await Patient.countDocuments()
  if (existingPatientCount >= 20) {
    logger.info(`Bulk clinical data already present (${existingPatientCount} patients) — skipping.`)
    return
  }

  logger.info('Seeding bulk clinical data (patients, staff, appointments, encounters, lab orders)...')

  // --- Staff: top up to 5 doctors and 5 nurses total (kwamedoc@sana.test
  // and akosuanurse@sana.test, created earlier by seed(), already count
  // toward that 5) ---
  const [doctorRole, nurseRole] = await Promise.all([
    Role.findOne({ name: 'DOCTOR' }),
    Role.findOne({ name: 'NURSE' }),
  ])
  if (!doctorRole || !nurseRole) throw new Error('Roles must be seeded before bulk clinical data')

  const [existingDoctors, existingNurses] = await Promise.all([
    User.find({ role: doctorRole._id }),
    User.find({ role: nurseRole._id }),
  ])
  const usedEmails = new Set([...existingDoctors, ...existingNurses].map((u) => u.email))

  const newDoctors = await createStaffBatch(doctorRole._id, Math.max(0, 5 - existingDoctors.length), usedEmails)
  const newNurses = await createStaffBatch(nurseRole._id, Math.max(0, 5 - existingNurses.length), usedEmails)
  const doctors = [...existingDoctors, ...newDoctors]
  const nurses = [...existingNurses, ...newNurses]
  logger.info(`Staff ready: ${doctors.length} doctors, ${nurses.length} nurses`)

  // --- Patients: creates 50-100 patients, including linking
  // kofipatient@sana.test's login to one specific Patient record, the same
  // linking that used to be done by hand during manual testing and is now
  // done automatically by the seed script instead ---
  const patients: PatientDoc[] = []

  const patientUser = await User.findOne({ email: 'kofipatient@sana.test' })
  if (patientUser) {
    let linkedPatient = await Patient.findOne({ user: patientUser.id })
    if (!linkedPatient) {
      linkedPatient = await Patient.create({
        patientNumber: await generateId('SAN'),
        firstName: patientUser.firstName,
        lastName: patientUser.lastName,
        dob: randomDob(),
        gender: randomGender(),
        phone: randomGhanaPhone(),
        email: patientUser.email,
        user: patientUser._id,
      })
    }
    patients.push(linkedPatient)
  }

  const targetPatientCount = randomInt(60, 90)
  while (patients.length < targetPatientCount) {
    const gender = randomGender()
    const { firstName, lastName } = randomName(gender)
    patients.push(
      await Patient.create({
        patientNumber: await generateId('SAN'),
        firstName,
        lastName,
        dob: randomDob(),
        gender,
        phone: randomGhanaPhone(),
        address: 'Accra, Ghana',
      }),
    )
  }
  logger.info(`Patients ready: ${patients.length}`)

  // --- Appointments: 100+, spread across the past 30 days to the next 14 ---
  const appointmentCount = randomInt(100, 130)
  const appointments = []
  for (let i = 0; i < appointmentCount; i++) {
    const date = randomDateAround(30, 14)
    const startTime = randomTimeSlot()
    const isPast = date.getTime() < Date.now()

    // Past appointments are mostly given a final status (completed, no-show,
    // or cancelled), while future ones are left in an earlier, still-pending
    // state. This is a simple but reasonable spread of statuses for demo
    // purposes.
    let status: AppointmentStatus
    if (isPast) {
      const roll = Math.random()
      status = roll < 0.75 ? 'COMPLETED' : roll < 0.9 ? 'NO_SHOW' : 'CANCELLED'
    } else {
      status = Math.random() < 0.7 ? 'BOOKED' : 'CONFIRMED'
    }

    appointments.push(
      await Appointment.create({
        appointmentNumber: await generateId('APT'),
        patient: randomFrom(patients)._id,
        doctor: randomFrom(doctors)._id,
        date,
        startTime,
        endTime: addMinutes(startTime, 30),
        reason: randomFrom(CHIEF_COMPLAINTS),
        status,
      }),
    )
  }
  logger.info(`Appointments ready: ${appointments.length}`)

  // --- Encounters: creates up to 50, drawn from COMPLETED past appointments,
  // since an encounter only makes sense for a visit that actually happened ---
  const completedAppointments = appointments.filter((a) => a.status === 'COMPLETED')
  const encounterCount = Math.min(50, completedAppointments.length)
  const encounters = []
  for (let i = 0; i < encounterCount; i++) {
    const appt = completedAppointments[i]!
    const startedAt = appt.date
    // Most seeded encounters are wrapped up (COMPLETED), but a few are left
    // IN_PROGRESS so the doctor and nurse dashboards have something to show
    // as "currently open" during a demo.
    const isComplete = Math.random() < 0.85

    const encounter = await Encounter.create({
      patient: appt.patient,
      doctor: appt.doctor,
      appointment: appt._id,
      chiefComplaint: randomFrom(CHIEF_COMPLAINTS),
      history: 'No significant past medical history reported.',
      status: isComplete ? 'COMPLETED' : 'IN_PROGRESS',
      startedAt,
      completedAt: isComplete ? new Date(startedAt.getTime() + 30 * 60 * 1000) : undefined,
    })
    encounters.push(encounter)

    // Records one set of vitals per encounter, recorded by a random nurse.
    // Without this, the 50 encounters would be clinically empty records with
    // nothing for a nurse's dashboard metric (vitalsRecordedToday) to ever
    // count.
    await VitalSign.create({
      encounter: encounter._id,
      patient: appt.patient,
      recordedBy: randomFrom(nurses)._id,
      temperature: Number((36.0 + Math.random() * 2.5).toFixed(1)),
      heartRate: randomInt(60, 110),
      respiratoryRate: randomInt(14, 24),
      systolicBp: randomInt(100, 150),
      diastolicBp: randomInt(60, 95),
      oxygenSaturation: randomInt(94, 100),
      recordedAt: startedAt,
    })
  }
  logger.info(`Encounters ready: ${encounters.length} (with vitals)`)

  // --- Lab orders: 30, against a random subset of encounters ---
  const labOrderCount = Math.min(30, encounters.length)
  const shuffledEncounters = [...encounters].sort(() => Math.random() - 0.5)
  let labOrdersCreated = 0
  for (let i = 0; i < labOrderCount; i++) {
    const encounter = shuffledEncounters[i]!
    const testCount = randomInt(1, 3)
    const tests = Array.from({ length: testCount }, () => ({ testName: randomFrom(LAB_TEST_NAMES) }))

    await LabOrder.create({
      labOrderNumber: await generateId('LAB'),
      encounter: encounter._id,
      patient: encounter.patient,
      doctor: encounter.doctor,
      tests,
      priority: Math.random() < 0.2 ? 'URGENT' : 'ROUTINE',
      status: 'ORDERED',
      orderedAt: encounter.startedAt,
    })
    labOrdersCreated++
  }
  logger.info(`Lab orders ready: ${labOrdersCreated}`)

  logger.info('Bulk clinical data seed complete.')
}
