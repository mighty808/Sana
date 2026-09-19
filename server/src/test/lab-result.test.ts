import { createLabResult, releaseLabResult, listLabResults } from '../services/labResult.service.js'
import { LabOrder } from '../models/LabOrder.js'
import { Notification } from '../models/Notification.js'
import { Patient } from '../models/Patient.js'
import { refToIdString } from '../utils/populate.js'
import { connectTestDb, clearTestDb, disconnectTestDb, DB_BOOT_TIMEOUT_MS } from './setupTestDb.js'
import { createUser, createPatient, createEncounter, createLabOrder } from './factories.js'

beforeAll(connectTestDb, DB_BOOT_TIMEOUT_MS)
afterEach(clearTestDb)
afterAll(disconnectTestDb, DB_BOOT_TIMEOUT_MS)

describe('createLabResult', () => {
  test('fills the PENDING slot and rolls the order up to COMPLETED once every test is done', async () => {
    const doctor = await createUser('DOCTOR')
    const labTech = await createUser('LAB_TECH')
    const patient = await createPatient()
    const encounter = await createEncounter(doctor.id, patient.id)
    const order = await createLabOrder(doctor.id, patient.id, encounter.id) // one PENDING "CBC" test

    const result = await createLabResult(
      { labOrder: order.id, testName: 'CBC', resultValue: '4.5', unit: 'x10^9/L' },
      labTech.id,
    )

    expect(result.resultValue).toBe('4.5')
    // createLabResult always returns `patient` populated — see its own comment.
    expect(refToIdString(result.patient)).toBe(patient.id)
    const rereadOrder = await LabOrder.findById(order.id)
    expect(rereadOrder?.tests[0]?.status).toBe('COMPLETED')
    expect(rereadOrder?.status).toBe('COMPLETED') // the only test on this order is now done
  })

  test('rolls the order up to only PROCESSING while some tests are still PENDING', async () => {
    const doctor = await createUser('DOCTOR')
    const labTech = await createUser('LAB_TECH')
    const patient = await createPatient()
    const encounter = await createEncounter(doctor.id, patient.id)
    const order = await LabOrder.create({
      labOrderNumber: 'LAB-MULTI-1',
      encounter: encounter.id,
      patient: patient.id,
      doctor: doctor.id,
      tests: [{ testName: 'CBC' }, { testName: 'Malaria RDT' }],
    })

    await createLabResult({ labOrder: order.id, testName: 'CBC', resultValue: '4.5' }, labTech.id)

    const rereadOrder = await LabOrder.findById(order.id)
    expect(rereadOrder?.status).toBe('PROCESSING')
    expect(rereadOrder?.tests.find((t) => t.testName === 'CBC')?.status).toBe('COMPLETED')
    expect(rereadOrder?.tests.find((t) => t.testName === 'Malaria RDT')?.status).toBe('PENDING')
  })

  test('a duplicate test name fills only ONE slot at a time, not both', async () => {
    const doctor = await createUser('DOCTOR')
    const labTech = await createUser('LAB_TECH')
    const patient = await createPatient()
    const encounter = await createEncounter(doctor.id, patient.id)
    const order = await LabOrder.create({
      labOrderNumber: 'LAB-DUP-1',
      encounter: encounter.id,
      patient: patient.id,
      doctor: doctor.id,
      tests: [{ testName: 'CBC' }, { testName: 'CBC' }],
    })

    await createLabResult({ labOrder: order.id, testName: 'CBC', resultValue: 'first' }, labTech.id)

    const rereadOrder = await LabOrder.findById(order.id)
    const statuses = rereadOrder?.tests.map((t) => t.status) ?? []
    expect(statuses.filter((s) => s === 'COMPLETED')).toHaveLength(1)
    expect(statuses.filter((s) => s === 'PENDING')).toHaveLength(1)
    expect(rereadOrder?.status).toBe('PROCESSING') // one slot still pending
  })

  test('rejects a nonexistent lab order', async () => {
    const labTech = await createUser('LAB_TECH')
    await expect(
      createLabResult({ labOrder: '507f1f77bcf86cd799439011', testName: 'CBC', resultValue: '1' }, labTech.id),
    ).rejects.toMatchObject({ status: 404, code: 'LAB_ORDER_NOT_FOUND' })
  })

  test('rejects a test name with no PENDING slot (wrong name or already resulted)', async () => {
    const doctor = await createUser('DOCTOR')
    const labTech = await createUser('LAB_TECH')
    const patient = await createPatient()
    const encounter = await createEncounter(doctor.id, patient.id)
    const order = await createLabOrder(doctor.id, patient.id, encounter.id) // one "CBC" test

    await expect(
      createLabResult({ labOrder: order.id, testName: 'Nonexistent Test', resultValue: '1' }, labTech.id),
    ).rejects.toMatchObject({ status: 400, code: 'TEST_NOT_ORDERED' })
  })
})

describe('releaseLabResult', () => {
  test('marks the result RELEASED and notifies the ordering doctor', async () => {
    const doctor = await createUser('DOCTOR')
    const labTech = await createUser('LAB_TECH')
    const patient = await createPatient()
    const encounter = await createEncounter(doctor.id, patient.id)
    const order = await createLabOrder(doctor.id, patient.id, encounter.id)
    const result = await createLabResult({ labOrder: order.id, testName: 'CBC', resultValue: '4.5' }, labTech.id)

    const released = await releaseLabResult(result.id, labTech.id)

    expect(released.status).toBe('RELEASED')
    expect(released.releasedAt).toBeInstanceOf(Date)
    const notification = await Notification.findOne({ user: doctor.id, entityId: result.id })
    expect(notification?.entityType).toBe('LabResult')
  })

  test('rejects releasing an already-released result', async () => {
    const doctor = await createUser('DOCTOR')
    const labTech = await createUser('LAB_TECH')
    const patient = await createPatient()
    const encounter = await createEncounter(doctor.id, patient.id)
    const order = await createLabOrder(doctor.id, patient.id, encounter.id)
    const result = await createLabResult({ labOrder: order.id, testName: 'CBC', resultValue: '4.5' }, labTech.id)
    await releaseLabResult(result.id, labTech.id)

    await expect(releaseLabResult(result.id, labTech.id)).rejects.toMatchObject({
      status: 409,
      code: 'ALREADY_RELEASED',
    })
  })

  test('rejects a nonexistent result id', async () => {
    const labTech = await createUser('LAB_TECH')
    await expect(releaseLabResult('507f1f77bcf86cd799439011', labTech.id)).rejects.toMatchObject({
      status: 404,
      code: 'LAB_RESULT_NOT_FOUND',
    })
  })
})

describe('listLabResults', () => {
  test('a PATIENT only sees their own RELEASED results, never an ENTERED-but-not-yet-released one', async () => {
    const doctor = await createUser('DOCTOR')
    const labTech = await createUser('LAB_TECH')
    const patientUser = await createUser('PATIENT')
    const patient = await createPatient()
    await Patient.updateOne({ _id: patient.id }, { user: patientUser.id })
    const encounter = await createEncounter(doctor.id, patient.id)
    const order = await LabOrder.create({
      labOrderNumber: 'LAB-PT-1',
      encounter: encounter.id,
      patient: patient.id,
      doctor: doctor.id,
      tests: [{ testName: 'CBC' }, { testName: 'Malaria RDT' }],
    })
    const released = await createLabResult({ labOrder: order.id, testName: 'CBC', resultValue: '4.5' }, labTech.id)
    await releaseLabResult(released.id, labTech.id)
    await createLabResult({ labOrder: order.id, testName: 'Malaria RDT', resultValue: 'Negative' }, labTech.id) // stays ENTERED

    const result = await listLabResults(patientUser)
    expect(result).toHaveLength(1)
    expect(result[0]?.status).toBe('RELEASED')
  })

  test('a PATIENT with no linked record sees an empty list', async () => {
    const patientUser = await createUser('PATIENT')
    await expect(listLabResults(patientUser)).resolves.toEqual([])
  })

  test('a DOCTOR only sees results from lab orders they placed', async () => {
    const doctorA = await createUser('DOCTOR')
    const doctorB = await createUser('DOCTOR')
    const labTech = await createUser('LAB_TECH')
    const patient = await createPatient()
    const encounterA = await createEncounter(doctorA.id, patient.id)
    const encounterB = await createEncounter(doctorB.id, patient.id)
    const orderA = await createLabOrder(doctorA.id, patient.id, encounterA.id)
    const orderB = await createLabOrder(doctorB.id, patient.id, encounterB.id)
    await createLabResult({ labOrder: orderA.id, testName: 'CBC', resultValue: '1' }, labTech.id)
    await createLabResult({ labOrder: orderB.id, testName: 'CBC', resultValue: '2' }, labTech.id)

    const result = await listLabResults(doctorA)
    expect(result).toHaveLength(1)
  })

  test('ADMIN and LAB_TECH see every result', async () => {
    const doctorA = await createUser('DOCTOR')
    const doctorB = await createUser('DOCTOR')
    const admin = await createUser('ADMIN')
    const labTech = await createUser('LAB_TECH')
    const patient = await createPatient()
    const encounterA = await createEncounter(doctorA.id, patient.id)
    const encounterB = await createEncounter(doctorB.id, patient.id)
    const orderA = await createLabOrder(doctorA.id, patient.id, encounterA.id)
    const orderB = await createLabOrder(doctorB.id, patient.id, encounterB.id)
    await createLabResult({ labOrder: orderA.id, testName: 'CBC', resultValue: '1' }, labTech.id)
    await createLabResult({ labOrder: orderB.id, testName: 'CBC', resultValue: '2' }, labTech.id)

    await expect(listLabResults(admin)).resolves.toHaveLength(2)
    await expect(listLabResults(labTech)).resolves.toHaveLength(2)
  })
})
