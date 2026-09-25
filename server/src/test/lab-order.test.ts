import { createLabOrder, updateLabOrder, deleteLabOrder, listLabOrders } from '../services/labOrder.service.js'
import { LabOrder } from '../models/LabOrder.js'
import { refToIdString } from '../utils/populate.js'
import { connectTestDb, clearTestDb, disconnectTestDb, DB_BOOT_TIMEOUT_MS } from './setupTestDb.js'
import { createUser, createPatient, createEncounter, createLabOrder as createLabOrderFixture } from './factories.js'

beforeAll(connectTestDb, DB_BOOT_TIMEOUT_MS)
afterEach(clearTestDb)
afterAll(disconnectTestDb, DB_BOOT_TIMEOUT_MS)

describe('createLabOrder', () => {
  test('the assigned doctor can order tests on their own open encounter', async () => {
    const doctor = await createUser('DOCTOR')
    const patient = await createPatient()
    const encounter = await createEncounter(doctor.id, patient.id)

    const order = await createLabOrder({ encounter: encounter.id, tests: [{ testName: 'CBC' }] }, doctor.id)

    expect(order.labOrderNumber).toMatch(/^LAB/)
    // createLabOrder always returns `patient` fully populated (see its own
    // comment on why), so this needs refToIdString rather than
    // .toString() on what's actually a whole Patient document, not a raw
    // ObjectId.
    expect(refToIdString(order.patient)).toBe(patient.id)
    expect(order.status).toBe('ORDERED')
  })

  test('a different doctor cannot order tests on someone else\'s encounter', async () => {
    const owner = await createUser('DOCTOR')
    const stranger = await createUser('DOCTOR')
    const patient = await createPatient()
    const encounter = await createEncounter(owner.id, patient.id)

    await expect(
      createLabOrder({ encounter: encounter.id, tests: [{ testName: 'CBC' }] }, stranger.id),
    ).rejects.toMatchObject({ status: 404, code: 'ENCOUNTER_NOT_FOUND' })
  })

  test('cannot order tests on a COMPLETED encounter', async () => {
    const doctor = await createUser('DOCTOR')
    const patient = await createPatient()
    const encounter = await createEncounter(doctor.id, patient.id, { status: 'COMPLETED' })

    await expect(
      createLabOrder({ encounter: encounter.id, tests: [{ testName: 'CBC' }] }, doctor.id),
    ).rejects.toMatchObject({ status: 409, code: 'ENCOUNTER_COMPLETED' })
  })
})

describe('updateLabOrder', () => {
  test('the ordering doctor can edit tests/priority/notes while still ORDERED', async () => {
    const doctor = await createUser('DOCTOR')
    const patient = await createPatient()
    const encounter = await createEncounter(doctor.id, patient.id)
    const order = await createLabOrderFixture(doctor.id, patient.id, encounter.id)

    const updated = await updateLabOrder(order.id, doctor.id, {
      tests: [{ testName: 'Full Blood Count' }],
      priority: 'URGENT',
    })
    expect(updated.tests.map((t) => t.testName)).toEqual(['Full Blood Count'])
    expect(updated.priority).toBe('URGENT')
  })

  test('omitting clinicalNotes on an edit does not wipe an existing note', async () => {
    const doctor = await createUser('DOCTOR')
    const patient = await createPatient()
    const encounter = await createEncounter(doctor.id, patient.id)
    const order = await createLabOrderFixture(doctor.id, patient.id, encounter.id)
    await LabOrder.updateOne({ _id: order.id }, { clinicalNotes: 'Patient fasting' })

    const updated = await updateLabOrder(order.id, doctor.id, { tests: [{ testName: 'CBC' }] })
    expect(updated.clinicalNotes).toBe('Patient fasting')
  })

  test('a different doctor cannot edit someone else\'s order', async () => {
    const owner = await createUser('DOCTOR')
    const stranger = await createUser('DOCTOR')
    const patient = await createPatient()
    const encounter = await createEncounter(owner.id, patient.id)
    const order = await createLabOrderFixture(owner.id, patient.id, encounter.id)

    await expect(updateLabOrder(order.id, stranger.id, { tests: [{ testName: 'CBC' }] })).rejects.toMatchObject({
      status: 404,
    })
  })

  test('cannot edit an order once it is no longer ORDERED (results already coming in)', async () => {
    const doctor = await createUser('DOCTOR')
    const patient = await createPatient()
    const encounter = await createEncounter(doctor.id, patient.id)
    const order = await createLabOrderFixture(doctor.id, patient.id, encounter.id)
    await LabOrder.updateOne({ _id: order.id }, { status: 'PROCESSING' })

    await expect(updateLabOrder(order.id, doctor.id, { tests: [{ testName: 'CBC' }] })).rejects.toMatchObject({
      status: 409,
      code: 'LAB_ORDER_IN_PROGRESS',
    })
  })
})

describe('deleteLabOrder', () => {
  test('the ordering doctor can delete an order placed in error while still ORDERED', async () => {
    const doctor = await createUser('DOCTOR')
    const patient = await createPatient()
    const encounter = await createEncounter(doctor.id, patient.id)
    const order = await createLabOrderFixture(doctor.id, patient.id, encounter.id)

    await deleteLabOrder(order.id, doctor.id)
    expect(await LabOrder.findById(order.id)).toBeNull()
  })

  test('a different doctor cannot delete someone else\'s order', async () => {
    const owner = await createUser('DOCTOR')
    const stranger = await createUser('DOCTOR')
    const patient = await createPatient()
    const encounter = await createEncounter(owner.id, patient.id)
    const order = await createLabOrderFixture(owner.id, patient.id, encounter.id)

    await expect(deleteLabOrder(order.id, stranger.id)).rejects.toMatchObject({ status: 404 })
    expect(await LabOrder.findById(order.id)).not.toBeNull()
  })

  test('cannot delete an order once it is no longer ORDERED (results already coming in)', async () => {
    const doctor = await createUser('DOCTOR')
    const patient = await createPatient()
    const encounter = await createEncounter(doctor.id, patient.id)
    const order = await createLabOrderFixture(doctor.id, patient.id, encounter.id)
    await LabOrder.updateOne({ _id: order.id }, { status: 'PROCESSING' })

    await expect(deleteLabOrder(order.id, doctor.id)).rejects.toMatchObject({
      status: 409,
      code: 'LAB_ORDER_IN_PROGRESS',
    })
  })
})

describe('listLabOrders', () => {
  test('NURSE gets an empty list — their laborder.read only exists for the encounter view', async () => {
    const doctor = await createUser('DOCTOR')
    const nurse = await createUser('NURSE')
    const patient = await createPatient()
    const encounter = await createEncounter(doctor.id, patient.id)
    await createLabOrderFixture(doctor.id, patient.id, encounter.id)

    await expect(listLabOrders(nurse)).resolves.toEqual([])
  })

  test('a DOCTOR only sees the orders they personally placed', async () => {
    const doctorA = await createUser('DOCTOR')
    const doctorB = await createUser('DOCTOR')
    const patient = await createPatient()
    const encounterA = await createEncounter(doctorA.id, patient.id)
    const encounterB = await createEncounter(doctorB.id, patient.id)
    await createLabOrderFixture(doctorA.id, patient.id, encounterA.id)
    await createLabOrderFixture(doctorB.id, patient.id, encounterB.id)

    const result = await listLabOrders(doctorA)
    expect(result).toHaveLength(1)
  })

  test('ADMIN and LAB_TECH see every order', async () => {
    const doctorA = await createUser('DOCTOR')
    const doctorB = await createUser('DOCTOR')
    const admin = await createUser('ADMIN')
    const labTech = await createUser('LAB_TECH')
    const patient = await createPatient()
    const encounterA = await createEncounter(doctorA.id, patient.id)
    const encounterB = await createEncounter(doctorB.id, patient.id)
    await createLabOrderFixture(doctorA.id, patient.id, encounterA.id)
    await createLabOrderFixture(doctorB.id, patient.id, encounterB.id)

    await expect(listLabOrders(admin)).resolves.toHaveLength(2)
    await expect(listLabOrders(labTech)).resolves.toHaveLength(2)
  })

  test('an invalid status filter is rejected with a clear 400, not a silent empty list', async () => {
    const admin = await createUser('ADMIN')
    await expect(listLabOrders(admin, 'NOT_A_REAL_STATUS')).rejects.toMatchObject({
      status: 400,
      code: 'INVALID_STATUS',
    })
  })

  test('a valid status filter narrows the results', async () => {
    const doctor = await createUser('DOCTOR')
    const admin = await createUser('ADMIN')
    const patient = await createPatient()
    const encounter = await createEncounter(doctor.id, patient.id)
    const order = await createLabOrderFixture(doctor.id, patient.id, encounter.id)
    await LabOrder.updateOne({ _id: order.id }, { status: 'COMPLETED' })
    await createLabOrderFixture(doctor.id, patient.id, encounter.id) // stays ORDERED

    const completedOnly = await listLabOrders(admin, 'COMPLETED')
    expect(completedOnly).toHaveLength(1)
  })
})
