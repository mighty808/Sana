// Generates realistic-looking bulk demo data on top of the roles + single
// test account per role that utils/seed.ts already creates — this is what
// blueprint section 13.2 calls for: enough patients/appointments/encounters/
// lab orders that the demo script (section 10.1) and screenshots for the
// final report have real, varied data to show instead of a nearly-empty
// database with just 4 accounts and 1 patient.
//
// Deliberately writes directly via Mongoose models rather than going
// through the service layer (appointment.service.ts's createAppointment,
// etc.) — those functions do things appropriate for a live HTTP request
// (conflict checks, notifications, audit logs) that don't make sense when
// bulk-generating hundreds of historical records offline.

import type { Types } from 'mongoose'
import { Department } from '../models/Department.js'
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
  DEPARTMENTS,
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

// Same password as the named test accounts (admin@sana.test etc.) — fine
// for bulk fictional demo data, never use a fixed password like this for
// real accounts.
const BULK_PASSWORD = 'Password123!'

// Creates `count` additional staff users of the given role, skipping name
// collisions (retried up to a small cap — with ~400 name combinations per
// gender this essentially never gets close to exhausting attempts for the
// handful of extra doctors/nurses needed).
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
  // Guard: if bulk data already looks present, skip entirely — re-running
  // `npm run seed` in dev shouldn't keep multiplying hundreds of records
  // every time. 20 is comfortably above the handful of patients created by
  // manual testing in earlier phases, but well below the 50+ this function creates.
  const existingPatientCount = await Patient.countDocuments()
  if (existingPatientCount >= 20) {
    logger.info(`Bulk clinical data already present (${existingPatientCount} patients) — skipping.`)
    return
  }

  logger.info('Seeding bulk clinical data (patients, staff, appointments, encounters, lab orders)...')

  // --- Departments ---
  const departments = []
  for (const dept of DEPARTMENTS) {
    const doc = await Department.findOneAndUpdate({ name: dept.name }, dept, {
      upsert: true,
      returnDocument: 'after',
    })
    departments.push(doc!)
  }

  // --- Staff: top up to 5 doctors / 5 nurses total (doctor@sana.test and
  // nurse@sana.test from seed() already count toward that 5) ---
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

  // --- Patients: 50-100, including linking patient@sana.test's login to
  // one specific Patient record (matching what earlier phases' manual
  // testing did by hand — now reproducible via the seed script itself) ---
  const patients: PatientDoc[] = []

  const patientUser = await User.findOne({ email: 'patient@sana.test' })
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

    // Past appointments have mostly resolved to a terminal status; future
    // ones are still pending in some pre-visit state — a simple but
    // reasonable status distribution for demo purposes.
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
        department: randomFrom(departments)._id,
        date,
        startTime,
        endTime: addMinutes(startTime, 30),
        reason: randomFrom(CHIEF_COMPLAINTS),
        status,
      }),
    )
  }
  logger.info(`Appointments ready: ${appointments.length}`)

  // --- Encounters: 50, drawn from COMPLETED past appointments (an
  // encounter only makes sense for a visit that actually happened) ---
  const completedAppointments = appointments.filter((a) => a.status === 'COMPLETED')
  const encounterCount = Math.min(50, completedAppointments.length)
  const encounters = []
  for (let i = 0; i < encounterCount; i++) {
    const appt = completedAppointments[i]!
    const startedAt = appt.date
    // Most seeded encounters are wrapped up (COMPLETED), a few left
    // IN_PROGRESS so the doctor/nurse dashboards have something to show as
    // "currently open" during a demo.
    const isComplete = Math.random() < 0.85

    const encounter = await Encounter.create({
      patient: appt.patient,
      doctor: appt.doctor,
      appointment: appt._id,
      department: appt.department,
      chiefComplaint: randomFrom(CHIEF_COMPLAINTS),
      history: 'No significant past medical history reported.',
      status: isComplete ? 'COMPLETED' : 'IN_PROGRESS',
      startedAt,
      completedAt: isComplete ? new Date(startedAt.getTime() + 30 * 60 * 1000) : undefined,
    })
    encounters.push(encounter)

    // One set of vitals per encounter, recorded by a random nurse —
    // without this, "50 encounters" would otherwise be clinically empty
    // records with nothing a nurse's dashboard metric (vitalsRecordedToday)
    // could ever reflect.
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
