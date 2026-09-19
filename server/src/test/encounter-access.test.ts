// Regression coverage for the encounter access-control rule added this
// session: GET /encounters/:id (and, by extension, the lab-order and AI
// consultation lookups that reuse mayReadEncounter) used to take no user
// at all, so any doctor could read any patient's encounter by id — a hole
// that bypassed the doctor-scoping every list view already enforces via
// scopeToOwnDoctor. This file is what should have existed before that fix
// shipped; until now it was only checked with throwaway scripts run once
// against the real database and then deleted.
import { getEncounterById, mayReadEncounter } from '../services/encounter.service.js'
import { Referral } from '../models/Referral.js'
import { AppError } from '../utils/apiResponse.js'
import { connectTestDb, clearTestDb, disconnectTestDb, DB_BOOT_TIMEOUT_MS } from './setupTestDb.js'
import { createUser, createPatient, createEncounter } from './factories.js'

beforeAll(connectTestDb, DB_BOOT_TIMEOUT_MS)
afterEach(clearTestDb)
afterAll(disconnectTestDb, DB_BOOT_TIMEOUT_MS)

describe('encounter access control', () => {
  test('the assigned doctor can read their own encounter', async () => {
    const doctor = await createUser('DOCTOR')
    const patient = await createPatient()
    const encounter = await createEncounter(doctor.id, patient.id)

    const result = await getEncounterById(encounter.id, doctor)
    expect(result.encounter.id).toBe(encounter.id)
  })

  test('ADMIN can read any encounter', async () => {
    const owner = await createUser('DOCTOR')
    const admin = await createUser('ADMIN')
    const patient = await createPatient()
    const encounter = await createEncounter(owner.id, patient.id)

    const result = await getEncounterById(encounter.id, admin)
    expect(result.encounter.id).toBe(encounter.id)
  })

  test('NURSE can read any encounter', async () => {
    const owner = await createUser('DOCTOR')
    const nurse = await createUser('NURSE')
    const patient = await createPatient()
    const encounter = await createEncounter(owner.id, patient.id)

    const result = await getEncounterById(encounter.id, nurse)
    expect(result.encounter.id).toBe(encounter.id)
  })

  test('an unrelated doctor is denied with a 404, not just a 403', async () => {
    const owner = await createUser('DOCTOR')
    const stranger = await createUser('DOCTOR')
    const patient = await createPatient()
    const encounter = await createEncounter(owner.id, patient.id)

    // Reported as "not found," not "forbidden" — this must never confirm
    // that an encounter it's hiding actually exists, the same way a
    // genuinely bad id 404s rather than 403s.
    await expect(getEncounterById(encounter.id, stranger)).rejects.toMatchObject({
      status: 404,
      code: 'ENCOUNTER_NOT_FOUND',
    } satisfies Partial<AppError>)
  })

  test('a doctor the encounter was referred to is allowed in', async () => {
    const owner = await createUser('DOCTOR')
    const receiving = await createUser('DOCTOR')
    const patient = await createPatient()
    const encounter = await createEncounter(owner.id, patient.id)

    await Referral.create({
      encounter: encounter.id,
      patient: patient.id,
      fromDoctor: owner.id,
      toDoctor: receiving.id,
      reason: 'Second opinion needed',
    })

    const result = await getEncounterById(encounter.id, receiving)
    expect(result.encounter.id).toBe(encounter.id)
  })

  test('a doctor who has treated this patient before (a different encounter) is allowed in', async () => {
    const owner = await createUser('DOCTOR')
    const otherDoctor = await createUser('DOCTOR')
    const patient = await createPatient()
    const targetEncounter = await createEncounter(owner.id, patient.id)
    // otherDoctor's own, unrelated encounter with the SAME patient — this
    // is what getPatientTimeline already treats as "has a relationship to
    // this patient," so reading a prior encounter through that same
    // relationship must not be blocked.
    await createEncounter(otherDoctor.id, patient.id)

    const result = await getEncounterById(targetEncounter.id, otherDoctor)
    expect(result.encounter.id).toBe(targetEncounter.id)
  })

  test('a doctor with no relationship to the patient at all is denied even if they treat OTHER patients', async () => {
    const owner = await createUser('DOCTOR')
    const stranger = await createUser('DOCTOR')
    const patientA = await createPatient()
    const patientB = await createPatient()
    const encounter = await createEncounter(owner.id, patientA.id)
    // stranger treats a completely different patient — this must not
    // accidentally grant access to patientA's encounter.
    await createEncounter(stranger.id, patientB.id)

    await expect(getEncounterById(encounter.id, stranger)).rejects.toMatchObject({ status: 404 })
  })

  test('mayReadEncounter returns false for an encounter id that does not exist', async () => {
    const doctor = await createUser('DOCTOR')
    const fakeId = '507f1f77bcf86cd799439011'
    await expect(mayReadEncounter(fakeId, doctor)).resolves.toBe(false)
  })

  test('mayReadEncounter is true for ADMIN even for a nonexistent-looking check — unrestricted before the lookup', async () => {
    const admin = await createUser('ADMIN')
    // ADMIN short-circuits to true without even querying — any id, real or not.
    const fakeId = '507f1f77bcf86cd799439011'
    await expect(mayReadEncounter(fakeId, admin)).resolves.toBe(true)
  })
})
