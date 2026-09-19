// Regression coverage for the bypass found and fixed this session:
// listConsultationsForEncounter (GET /ai/consultations?encounter=) filtered
// WHICH consultations a caller could see (a nurse only sees their own
// NURSE_VITALS_ANALYSIS entries) but never checked WHETHER the caller
// could read that encounter at all. Any doctor could pull the full AI
// history — chief complaint, a colleague's typed symptoms, Sana AI's
// diagnostic guidance — for any patient by substituting an encounter id.
// Fixed by gating on the same mayReadEncounter rule as GET /encounters/:id.
// Previously verified only by a throwaway script against the real
// database, run once and deleted.
import { listConsultationsForEncounter } from '../services/ai.service.js'
import { AiConsultation } from '../models/AiConsultation.js'
import { Referral } from '../models/Referral.js'
import { connectTestDb, clearTestDb, disconnectTestDb, DB_BOOT_TIMEOUT_MS } from './setupTestDb.js'
import { createUser, createPatient, createEncounter } from './factories.js'

beforeAll(connectTestDb, DB_BOOT_TIMEOUT_MS)
afterEach(clearTestDb)
afterAll(disconnectTestDb, DB_BOOT_TIMEOUT_MS)

// A consultation needs a valid `response` (diagnosticGuidance + disclaimer
// are required), but nothing in listConsultationsForEncounter reads their
// content, so a fixed placeholder is fine for every test here.
async function createConsultation(
  encounterId: string,
  doctorId: string,
  patientId: string,
  source: 'MANUAL' | 'NURSE_VITALS_ANALYSIS',
) {
  return AiConsultation.create({
    encounter: encounterId,
    doctor: doctorId,
    patient: patientId,
    query: 'test query',
    source,
    patientContext: { chiefComplaint: 'test' },
    response: { diagnosticGuidance: 'test guidance', disclaimer: 'test disclaimer' },
  })
}

describe('listConsultationsForEncounter — encounter access gate', () => {
  test('the assigned doctor sees every consultation on their own encounter', async () => {
    const doctor = await createUser('DOCTOR')
    const patient = await createPatient()
    const encounter = await createEncounter(doctor.id, patient.id)
    await createConsultation(encounter.id, doctor.id, patient.id, 'MANUAL')
    await createConsultation(encounter.id, doctor.id, patient.id, 'NURSE_VITALS_ANALYSIS')

    const result = await listConsultationsForEncounter(encounter.id, doctor)
    expect(result).toHaveLength(2)
  })

  // ADMIN holds neither 'ai.consult' nor 'ai.analyzeVitals' (see
  // permissions.ts), so the real route (gated by
  // requireAnyPermission('ai.consult', 'ai.analyzeVitals') in
  // ai.routes.ts) never lets an Admin reach this function at all — this
  // isn't a real production path. What's worth locking in about the
  // function itself is that mayReadEncounter's unrestricted access for a
  // non-DOCTOR role is independent from the per-source filter below: an
  // Admin's encounter access is unconditional, but a MANUAL consultation
  // still only surfaces for a caller who actually holds 'ai.consult'.
  test('ADMIN\'s unrestricted encounter access does not also grant ai.consult\'s broader source visibility', async () => {
    const owner = await createUser('DOCTOR')
    const admin = await createUser('ADMIN')
    const patient = await createPatient()
    const encounter = await createEncounter(owner.id, patient.id)
    await createConsultation(encounter.id, owner.id, patient.id, 'MANUAL')
    await createConsultation(encounter.id, owner.id, patient.id, 'NURSE_VITALS_ANALYSIS')

    const result = await listConsultationsForEncounter(encounter.id, admin)
    expect(result.map((c) => c.source)).toEqual(['NURSE_VITALS_ANALYSIS'])
  })

  test('an unrelated doctor gets nothing back — this is the bug that was fixed', async () => {
    const owner = await createUser('DOCTOR')
    const stranger = await createUser('DOCTOR')
    const patient = await createPatient()
    const encounter = await createEncounter(owner.id, patient.id)
    await createConsultation(encounter.id, owner.id, patient.id, 'MANUAL')

    const result = await listConsultationsForEncounter(encounter.id, stranger)
    expect(result).toEqual([])
  })

  test('a doctor the encounter was referred to can see its consultations', async () => {
    const owner = await createUser('DOCTOR')
    const receiving = await createUser('DOCTOR')
    const patient = await createPatient()
    const encounter = await createEncounter(owner.id, patient.id)
    await createConsultation(encounter.id, owner.id, patient.id, 'MANUAL')
    await Referral.create({
      encounter: encounter.id,
      patient: patient.id,
      fromDoctor: owner.id,
      toDoctor: receiving.id,
      reason: 'Second opinion',
    })

    const result = await listConsultationsForEncounter(encounter.id, receiving)
    expect(result).toHaveLength(1)
  })

  test('a doctor who has treated this patient before can see its consultations', async () => {
    const owner = await createUser('DOCTOR')
    const otherDoctor = await createUser('DOCTOR')
    const patient = await createPatient()
    const encounter = await createEncounter(owner.id, patient.id)
    await createConsultation(encounter.id, owner.id, patient.id, 'MANUAL')
    await createEncounter(otherDoctor.id, patient.id) // unrelated prior visit, same patient

    const result = await listConsultationsForEncounter(encounter.id, otherDoctor)
    expect(result).toHaveLength(1)
  })
})

describe('listConsultationsForEncounter — per-source visibility (once encounter access is granted)', () => {
  test('a doctor with ai.consult sees both MANUAL and NURSE_VITALS_ANALYSIS entries', async () => {
    const doctor = await createUser('DOCTOR')
    const patient = await createPatient()
    const encounter = await createEncounter(doctor.id, patient.id)
    await createConsultation(encounter.id, doctor.id, patient.id, 'MANUAL')
    await createConsultation(encounter.id, doctor.id, patient.id, 'NURSE_VITALS_ANALYSIS')

    const result = await listConsultationsForEncounter(encounter.id, doctor)
    expect(result.map((c) => c.source).sort()).toEqual(['MANUAL', 'NURSE_VITALS_ANALYSIS'])
  })

  test('a nurse only sees NURSE_VITALS_ANALYSIS entries, never a doctor\'s MANUAL consult on the same encounter', async () => {
    const doctor = await createUser('DOCTOR')
    const nurse = await createUser('NURSE')
    const patient = await createPatient()
    const encounter = await createEncounter(doctor.id, patient.id)
    await createConsultation(encounter.id, doctor.id, patient.id, 'MANUAL')
    await createConsultation(encounter.id, doctor.id, patient.id, 'NURSE_VITALS_ANALYSIS')

    const result = await listConsultationsForEncounter(encounter.id, nurse)
    expect(result).toHaveLength(1)
    expect(result[0]?.source).toBe('NURSE_VITALS_ANALYSIS')
  })
})
