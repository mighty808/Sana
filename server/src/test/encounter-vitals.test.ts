// Regression coverage for updateVitals' null-vs-undefined merge — the bug
// where clearing a vitals field (e.g. correcting a mistyped temperature
// back to "not recorded") silently failed, because both "clear this" and
// "leave this alone" arrived at the server as the same missing key. Fixed
// by having the client send `null` to mean "clear," `undefined`/omitted to
// mean "leave alone." Previously verified only by a throwaway script
// against the real database, run once and deleted.
import { addVitals, updateVitals, assertEncounterOpen } from '../services/encounter.service.js'
import { VitalSign } from '../models/VitalSign.js'
import { AppError } from '../utils/apiResponse.js'
import { connectTestDb, clearTestDb, disconnectTestDb, DB_BOOT_TIMEOUT_MS } from './setupTestDb.js'
import { createUser, createPatient, createEncounter } from './factories.js'

beforeAll(connectTestDb, DB_BOOT_TIMEOUT_MS)
afterEach(clearTestDb)
afterAll(disconnectTestDb, DB_BOOT_TIMEOUT_MS)

describe('updateVitals', () => {
  test('null explicitly clears a previously-recorded field', async () => {
    const doctor = await createUser('DOCTOR')
    const nurse = await createUser('NURSE')
    const patient = await createPatient()
    const encounter = await createEncounter(doctor.id, patient.id)
    const vitals = await addVitals(encounter.id, nurse.id, { temperature: 38.5, heartRate: 90, systolicBp: 120 })

    await updateVitals(encounter.id, vitals.id, { temperature: null, heartRate: 88 })

    const reread = await VitalSign.findById(vitals.id).lean()
    expect(reread).not.toHaveProperty('temperature')
    expect(reread?.heartRate).toBe(88)
    // systolicBp's key was absent from the update entirely (undefined) —
    // it must stay untouched, not be wiped just because the request
    // touched other fields on the same document.
    expect(reread?.systolicBp).toBe(120)
  })

  test('an omitted field is left alone, not cleared', async () => {
    const doctor = await createUser('DOCTOR')
    const nurse = await createUser('NURSE')
    const patient = await createPatient()
    const encounter = await createEncounter(doctor.id, patient.id)
    const vitals = await addVitals(encounter.id, nurse.id, { temperature: 38.5, heartRate: 90 })

    // Only correcting heartRate — temperature key isn't present at all.
    await updateVitals(encounter.id, vitals.id, { heartRate: 95 })

    const reread = await VitalSign.findById(vitals.id).lean()
    expect(reread?.temperature).toBe(38.5)
    expect(reread?.heartRate).toBe(95)
  })

  test('rejects an update once the encounter is COMPLETED', async () => {
    const doctor = await createUser('DOCTOR')
    const nurse = await createUser('NURSE')
    const patient = await createPatient()
    const encounter = await createEncounter(doctor.id, patient.id)
    const vitals = await addVitals(encounter.id, nurse.id, { temperature: 38.5 })

    encounter.status = 'COMPLETED'
    await encounter.save()

    await expect(updateVitals(encounter.id, vitals.id, { temperature: 37 })).rejects.toMatchObject({
      status: 409,
    } satisfies Partial<AppError>)
  })
})

describe('assertEncounterOpen', () => {
  test('does not throw for an IN_PROGRESS encounter', async () => {
    const doctor = await createUser('DOCTOR')
    const patient = await createPatient()
    const encounter = await createEncounter(doctor.id, patient.id)
    expect(() => assertEncounterOpen(encounter, 'test')).not.toThrow()
  })

  test('throws for a COMPLETED encounter', async () => {
    const doctor = await createUser('DOCTOR')
    const patient = await createPatient()
    const encounter = await createEncounter(doctor.id, patient.id, { status: 'COMPLETED' })
    expect(() => assertEncounterOpen(encounter, 'edit vitals on')).toThrow(AppError)
  })
})
