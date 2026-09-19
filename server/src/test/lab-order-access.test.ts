// Regression coverage for the same access-control hole as
// encounter-access.test.ts, applied to the two lab-order lookups that hang
// off an encounter. getLabOrderById used to take no user at all, and
// listLabOrdersForEncounter's own comment wrongly claimed it was "only
// reachable through an encounter the caller already holds encounter.read
// for" — but GET /lab-orders?encounter= takes any encounter id straight
// from the query string, so that was never an actual control. Both now
// share mayReadEncounter with GET /encounters/:id. Previously verified
// only by a throwaway script against the real database, run once and
// deleted.
import { getLabOrderById, listLabOrdersForEncounter } from '../services/labOrder.service.js'
import { LabOrder } from '../models/LabOrder.js'
import { Referral } from '../models/Referral.js'
import { connectTestDb, clearTestDb, disconnectTestDb, DB_BOOT_TIMEOUT_MS } from './setupTestDb.js'
import { createUser, createPatient, createEncounter } from './factories.js'

beforeAll(connectTestDb, DB_BOOT_TIMEOUT_MS)
afterEach(clearTestDb)
afterAll(disconnectTestDb, DB_BOOT_TIMEOUT_MS)

async function createTestLabOrder(doctorId: string, patientId: string, encounterId: string) {
  return LabOrder.create({
    labOrderNumber: `LAB-TEST-${Date.now()}-${Math.random()}`,
    encounter: encounterId,
    patient: patientId,
    doctor: doctorId,
    tests: [{ testName: 'CBC' }],
  })
}

describe('getLabOrderById', () => {
  test('the ordering doctor can read their own lab order', async () => {
    const doctor = await createUser('DOCTOR')
    const patient = await createPatient()
    const encounter = await createEncounter(doctor.id, patient.id)
    const order = await createTestLabOrder(doctor.id, patient.id, encounter.id)

    const result = await getLabOrderById(order.id, doctor)
    expect(result.order.id).toBe(order.id)
  })

  test('LAB_TECH can read any lab order — their queue is the whole hospital\'s orders', async () => {
    const doctor = await createUser('DOCTOR')
    const labTech = await createUser('LAB_TECH')
    const patient = await createPatient()
    const encounter = await createEncounter(doctor.id, patient.id)
    const order = await createTestLabOrder(doctor.id, patient.id, encounter.id)

    const result = await getLabOrderById(order.id, labTech)
    expect(result.order.id).toBe(order.id)
  })

  test('an unrelated doctor is denied, reported as a missing lab order (not a missing encounter)', async () => {
    const owner = await createUser('DOCTOR')
    const stranger = await createUser('DOCTOR')
    const patient = await createPatient()
    const encounter = await createEncounter(owner.id, patient.id)
    const order = await createTestLabOrder(owner.id, patient.id, encounter.id)

    await expect(getLabOrderById(order.id, stranger)).rejects.toMatchObject({
      status: 404,
      code: 'LAB_ORDER_NOT_FOUND',
    })
  })

  test('a doctor referred onto the order\'s encounter can read it', async () => {
    const owner = await createUser('DOCTOR')
    const receiving = await createUser('DOCTOR')
    const patient = await createPatient()
    const encounter = await createEncounter(owner.id, patient.id)
    const order = await createTestLabOrder(owner.id, patient.id, encounter.id)
    await Referral.create({
      encounter: encounter.id,
      patient: patient.id,
      fromDoctor: owner.id,
      toDoctor: receiving.id,
      reason: 'Second opinion',
    })

    const result = await getLabOrderById(order.id, receiving)
    expect(result.order.id).toBe(order.id)
  })
})

describe('listLabOrdersForEncounter — the ?encounter= side door', () => {
  test('the owning doctor sees their own encounter\'s lab orders', async () => {
    const doctor = await createUser('DOCTOR')
    const patient = await createPatient()
    const encounter = await createEncounter(doctor.id, patient.id)
    await createTestLabOrder(doctor.id, patient.id, encounter.id)

    const result = await listLabOrdersForEncounter(encounter.id, doctor)
    expect(result).toHaveLength(1)
  })

  test('an unrelated doctor gets an empty list, not another patient\'s orders', async () => {
    const owner = await createUser('DOCTOR')
    const stranger = await createUser('DOCTOR')
    const patient = await createPatient()
    const encounter = await createEncounter(owner.id, patient.id)
    await createTestLabOrder(owner.id, patient.id, encounter.id)

    const result = await listLabOrdersForEncounter(encounter.id, stranger)
    expect(result).toEqual([])
  })

  test('NURSE can load the Lab Results section for any encounter (their whole reason for holding laborder.read)', async () => {
    const doctor = await createUser('DOCTOR')
    const nurse = await createUser('NURSE')
    const patient = await createPatient()
    const encounter = await createEncounter(doctor.id, patient.id)
    await createTestLabOrder(doctor.id, patient.id, encounter.id)

    const result = await listLabOrdersForEncounter(encounter.id, nurse)
    expect(result).toHaveLength(1)
  })
})
