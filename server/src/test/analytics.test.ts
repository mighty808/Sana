import { getDashboard } from '../services/analytics.service.js'
import { LabOrder } from '../models/LabOrder.js'
import { Prescription } from '../models/Prescription.js'
import { LabResult } from '../models/LabResult.js'
import { Patient } from '../models/Patient.js'
import { connectTestDb, clearTestDb, disconnectTestDb, DB_BOOT_TIMEOUT_MS } from './setupTestDb.js'
import {
  createUser,
  createPatient,
  createEncounter,
  createAppointment,
  createLabOrder,
  createPrescription,
  createAiConsultation,
  createTestInvoice,
  createNotification,
} from './factories.js'
import type { AuthedUser } from '../types/user.js'

beforeAll(connectTestDb, DB_BOOT_TIMEOUT_MS)
afterEach(clearTestDb)
afterAll(disconnectTestDb, DB_BOOT_TIMEOUT_MS)

describe('getDashboard — ADMIN', () => {
  test('reports system-wide counts', async () => {
    const admin = await createUser('ADMIN')
    const doctor = await createUser('DOCTOR')
    await createUser('NURSE')
    const patientA = await createPatient()
    const patientB = await createPatient()
    await createAppointment(doctor.id, patientA.id, { date: new Date() }) // today
    const encounter = await createEncounter(doctor.id, patientB.id)
    await createLabOrder(doctor.id, patientB.id, encounter.id) // ORDERED
    await createTestInvoice(patientB.id, encounter.id, { total: 100 }) // fully unpaid
    await createAiConsultation(encounter.id, doctor.id, patientB.id, { acuityLevel: 'CRITICAL' })

    const result = await getDashboard(admin)

    // getDashboard's inferred return type widens `role` to plain `string`
    // in every branch (none of the switch's return objects are literally
    // typed), so TypeScript can't narrow the union from a `result.role ===
    // 'ADMIN'` check the way the client's own DashboardSummary type would
    // let it. A loose cast is the pragmatic fix here rather than touching
    // analytics.service.ts to add an explicit discriminated return type
    // just for this test file's benefit.
    const r = result as unknown as Record<string, number | string>
    expect(r.role).toBe('ADMIN')
    expect(r.totalPatients).toBe(2)
    expect(r.totalStaffUsers).toBe(3) // admin + doctor + nurse, not the patient logins
    expect(r.appointmentsToday).toBe(1)
    expect(r.pendingLabOrders).toBe(1)
    expect(r.outstandingBalance).toBe(100)
    expect(r.criticalPatients).toBe(1)
    expect(r.pendingInvoices).toBe(1)
  })
})

describe('getDashboard — DOCTOR', () => {
  test("reports this doctor's own workload only", async () => {
    const doctorA = await createUser('DOCTOR')
    const doctorB = await createUser('DOCTOR')
    const patient = await createPatient()
    await createAppointment(doctorA.id, patient.id, { date: new Date() })
    await createAppointment(doctorB.id, patient.id, { date: new Date() }) // not doctorA's
    const encounter = await createEncounter(doctorA.id, patient.id) // IN_PROGRESS
    const order = await createLabOrder(doctorA.id, patient.id, encounter.id)
    await LabOrder.updateOne({ _id: order.id }, { status: 'COMPLETED' }) // awaiting review
    // UNREVIEWED by default; also CRITICAL, so this doubles as the
    // criticalPatients fixture below.
    await createAiConsultation(encounter.id, doctorA.id, patient.id, { acuityLevel: 'CRITICAL' })

    const result = await getDashboard(doctorA)

    const r = result as unknown as Record<string, number | string>
    expect(r.role).toBe('DOCTOR')
    expect(r.myPatients).toBe(1)
    expect(r.appointmentsToday).toBe(1)
    expect(r.activeEncounters).toBe(1)
    expect(r.labOrdersAwaitingReview).toBe(1)
    expect(r.aiConsultationsUnreviewed).toBe(1)
    expect(r.criticalPatients).toBe(1)
  })

  test("does not count another doctor's critical encounter", async () => {
    const doctorA = await createUser('DOCTOR')
    const doctorB = await createUser('DOCTOR')
    const patient = await createPatient()
    const encounter = await createEncounter(doctorB.id, patient.id)
    await createAiConsultation(encounter.id, doctorB.id, patient.id, { acuityLevel: 'CRITICAL' })

    const result = await getDashboard(doctorA)

    const r = result as unknown as Record<string, number | string>
    expect(r.criticalPatients).toBe(0)
  })
})

describe('getDashboard — NURSE', () => {
  test('reports front-desk counts for today', async () => {
    const nurse = await createUser('NURSE')
    const doctor = await createUser('DOCTOR')
    // Both patients' createdAt defaults to now, so both count toward
    // "registered today."
    const patient = await createPatient()
    await createAppointment(doctor.id, patient.id, { date: new Date(), status: 'CHECKED_IN' })
    // A second checked-in-or-further appointment today with NO encounter yet.
    const patient2 = await createPatient()
    await createAppointment(doctor.id, patient2.id, { date: new Date(), status: 'IN_PROGRESS' })
    // A third patient with an actual open encounter, flagged CRITICAL — a
    // nurse sees every open encounter on the board, not just their own.
    const patient3 = await createPatient()
    const encounter = await createEncounter(doctor.id, patient3.id)
    await createAiConsultation(encounter.id, doctor.id, patient3.id, { acuityLevel: 'CRITICAL' })

    const result = await getDashboard(nurse)

    const r = result as unknown as Record<string, number | string>
    expect(r.role).toBe('NURSE')
    expect(r.patientsRegisteredToday).toBe(3)
    expect(r.appointmentsCheckedInToday).toBe(1)
    expect(r.vitalsPendingCount).toBe(2) // neither appointment has an encounter field set
    expect(r.criticalPatients).toBe(1)
  })
})

describe('getDashboard — PATIENT', () => {
  test("reports this patient's own summary", async () => {
    const doctor = await createUser('DOCTOR')
    const patientUser = await createUser('PATIENT')
    const patient = await createPatient()
    await Patient.updateOne({ _id: patient.id }, { user: patientUser.id })
    await createAppointment(doctor.id, patient.id, { date: new Date('2099-01-01') }) // far future -> upcoming
    const encounter = await createEncounter(doctor.id, patient.id)
    await createTestInvoice(patient.id, encounter.id, { total: 40 })
    await createNotification(patientUser.id) // unread by default (no readAt)

    const result = await getDashboard(patientUser)

    const r = result as unknown as Record<string, number | string>
    expect(r.role).toBe('PATIENT')
    expect(r.upcomingAppointments).toBe(1)
    expect(r.unreadNotifications).toBe(1)
    expect(r.outstandingBalance).toBe(40)
  })

  test('a PATIENT with no linked record gets all zeros, not an error', async () => {
    const patientUser = await createUser('PATIENT')
    const result = await getDashboard(patientUser)
    expect(result).toMatchObject({ upcomingAppointments: 0, unreadNotifications: 0, outstandingBalance: 0 })
  })
})

describe('getDashboard — LAB_TECH', () => {
  test('reports the four stages of the lab queue', async () => {
    const labTech = await createUser('LAB_TECH')
    const doctor = await createUser('DOCTOR')
    const patient = await createPatient()
    const encounter = await createEncounter(doctor.id, patient.id)
    await createLabOrder(doctor.id, patient.id, encounter.id) // ORDERED
    const processingOrder = await createLabOrder(doctor.id, patient.id, encounter.id)
    await LabOrder.updateOne({ _id: processingOrder.id }, { status: 'PROCESSING' })
    const completedOrder = await createLabOrder(doctor.id, patient.id, encounter.id)
    await LabOrder.updateOne({ _id: completedOrder.id }, { status: 'COMPLETED' })
    const releasedResult = await LabResult.create({
      labOrder: completedOrder.id,
      patient: patient.id,
      performedBy: labTech.id,
      testName: 'CBC',
      resultValue: '4.5',
      status: 'RELEASED',
      releasedBy: labTech.id,
      releasedAt: new Date(),
    })

    const result = await getDashboard(labTech)

    const r = result as unknown as Record<string, number | string>
    expect(r.role).toBe('LAB_TECH')
    expect(r.pendingOrders).toBe(1)
    expect(r.inProgressOrders).toBe(1)
    expect(r.completedToday).toBe(1)
    expect(r.releasedToday).toBe(1)
    void releasedResult
  })
})

describe('getDashboard — PHARMACIST', () => {
  test('reports the pharmacy queue state', async () => {
    const pharmacist = await createUser('PHARMACIST')
    const doctor = await createUser('DOCTOR')
    const patient = await createPatient()
    const encounter = await createEncounter(doctor.id, patient.id)
    await createPrescription(doctor.id, patient.id, encounter.id) // stays PRESCRIBED
    const rx = await createPrescription(doctor.id, patient.id, encounter.id)
    await Prescription.updateOne(
      { _id: rx.id },
      { status: 'DISPENSED', dispensedBy: pharmacist.id, dispensedAt: new Date() },
    )

    const result = await getDashboard(pharmacist)

    const r = result as unknown as Record<string, number | string>
    expect(r.role).toBe('PHARMACIST')
    expect(r.pendingPrescriptions).toBe(1)
    expect(r.dispensedToday).toBe(1)
  })
})

describe('getDashboard — unknown role', () => {
  test('throws a clear 500 rather than silently returning nothing', async () => {
    const fakeUser = { id: '507f1f77bcf86cd799439011', role: { name: 'BOGUS' } } as unknown as AuthedUser
    await expect(getDashboard(fakeUser)).rejects.toMatchObject({ status: 500, code: 'UNKNOWN_ROLE' })
  })
})
