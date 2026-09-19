import {
  createReferral,
  listIncomingReferrals,
  listOutgoingReferrals,
  updateReferralStatus,
} from '../services/referral.service.js'
import { Notification } from '../models/Notification.js'
import { connectTestDb, clearTestDb, disconnectTestDb, DB_BOOT_TIMEOUT_MS } from './setupTestDb.js'
import { createUser, createPatient, createEncounter } from './factories.js'

beforeAll(connectTestDb, DB_BOOT_TIMEOUT_MS)
afterEach(clearTestDb)
afterAll(disconnectTestDb, DB_BOOT_TIMEOUT_MS)

describe('createReferral', () => {
  test('the assigned doctor can refer their patient to another doctor', async () => {
    const fromDoctor = await createUser('DOCTOR')
    const toDoctor = await createUser('DOCTOR')
    const patient = await createPatient()
    const encounter = await createEncounter(fromDoctor.id, patient.id)

    const referral = await createReferral(encounter.id, fromDoctor.id, toDoctor.id, { reason: 'Cardiology opinion' })

    expect(referral.status).toBe('PENDING')
    expect(referral.patient.toString()).toBe(patient.id)
    const notification = await Notification.findOne({ user: toDoctor.id, entityId: referral.id })
    expect(notification?.entityType).toBe('Referral')
  })

  test('a doctor cannot refer from an encounter that is not theirs', async () => {
    const owner = await createUser('DOCTOR')
    const stranger = await createUser('DOCTOR')
    const toDoctor = await createUser('DOCTOR')
    const patient = await createPatient()
    const encounter = await createEncounter(owner.id, patient.id)

    await expect(
      createReferral(encounter.id, stranger.id, toDoctor.id, { reason: 'x' }),
    ).rejects.toMatchObject({ status: 404, code: 'ENCOUNTER_NOT_FOUND' })
  })

  test('cannot refer from a COMPLETED encounter', async () => {
    const fromDoctor = await createUser('DOCTOR')
    const toDoctor = await createUser('DOCTOR')
    const patient = await createPatient()
    const encounter = await createEncounter(fromDoctor.id, patient.id, { status: 'COMPLETED' })

    await expect(
      createReferral(encounter.id, fromDoctor.id, toDoctor.id, { reason: 'x' }),
    ).rejects.toMatchObject({ status: 409, code: 'ENCOUNTER_COMPLETED' })
  })

  test('cannot refer a patient to yourself', async () => {
    const doctor = await createUser('DOCTOR')
    const patient = await createPatient()
    const encounter = await createEncounter(doctor.id, patient.id)

    await expect(createReferral(encounter.id, doctor.id, doctor.id, { reason: 'x' })).rejects.toMatchObject({
      status: 400,
      code: 'INVALID_REFERRAL_TARGET',
    })
  })

  test('rejects a toDoctor id that is not actually a doctor', async () => {
    const fromDoctor = await createUser('DOCTOR')
    const nurse = await createUser('NURSE')
    const patient = await createPatient()
    const encounter = await createEncounter(fromDoctor.id, patient.id)

    await expect(createReferral(encounter.id, fromDoctor.id, nurse.id, { reason: 'x' })).rejects.toMatchObject({
      status: 404,
      code: 'DOCTOR_NOT_FOUND',
    })
  })

  test('rejects a toDoctor id that does not exist at all', async () => {
    const fromDoctor = await createUser('DOCTOR')
    const patient = await createPatient()
    const encounter = await createEncounter(fromDoctor.id, patient.id)

    await expect(
      createReferral(encounter.id, fromDoctor.id, '507f1f77bcf86cd799439011', { reason: 'x' }),
    ).rejects.toMatchObject({ status: 404, code: 'DOCTOR_NOT_FOUND' })
  })
})

describe('listIncomingReferrals', () => {
  test('only shows referrals sent TO this doctor, not ones they sent', async () => {
    const doctorA = await createUser('DOCTOR')
    const doctorB = await createUser('DOCTOR')
    const patient = await createPatient()
    const encounter = await createEncounter(doctorA.id, patient.id)
    await createReferral(encounter.id, doctorA.id, doctorB.id, { reason: 'to B' })

    const forA = await listIncomingReferrals(doctorA.id)
    const forB = await listIncomingReferrals(doctorB.id)
    expect(forA).toHaveLength(0)
    expect(forB).toHaveLength(1)
  })
})

describe('listOutgoingReferrals', () => {
  test('only shows referrals this doctor SENT — the exact mirror of the incoming list', async () => {
    const doctorA = await createUser('DOCTOR')
    const doctorB = await createUser('DOCTOR')
    const patient = await createPatient()
    const encounter = await createEncounter(doctorA.id, patient.id)
    await createReferral(encounter.id, doctorA.id, doctorB.id, { reason: 'to B' })

    const sentByA = await listOutgoingReferrals(doctorA.id)
    const sentByB = await listOutgoingReferrals(doctorB.id)

    expect(sentByA).toHaveLength(1)
    expect(sentByB).toHaveLength(0)

    // The two lists are opposites: what A sent is what B received, and
    // neither doctor sees the same referral in both of their own lists.
    await expect(listIncomingReferrals(doctorA.id)).resolves.toHaveLength(0)
    await expect(listIncomingReferrals(doctorB.id)).resolves.toHaveLength(1)
  })

  test('populates the receiving doctor, since the caller is the sender', async () => {
    const doctorA = await createUser('DOCTOR')
    const doctorB = await createUser('DOCTOR')
    const patient = await createPatient()
    const encounter = await createEncounter(doctorA.id, patient.id)
    await createReferral(encounter.id, doctorA.id, doctorB.id, { reason: 'x' })

    const [sent] = await listOutgoingReferrals(doctorA.id)
    const toDoctor = sent?.toDoctor as unknown as { firstName: string }
    expect(toDoctor.firstName).toBe(doctorB.firstName)
  })
})

describe('updateReferralStatus', () => {
  test('the receiving doctor can move the referral forward', async () => {
    const fromDoctor = await createUser('DOCTOR')
    const toDoctor = await createUser('DOCTOR')
    const patient = await createPatient()
    const encounter = await createEncounter(fromDoctor.id, patient.id)
    const referral = await createReferral(encounter.id, fromDoctor.id, toDoctor.id, { reason: 'x' })

    const updated = await updateReferralStatus(referral.id, toDoctor.id, 'ACKNOWLEDGED')
    expect(updated.status).toBe('ACKNOWLEDGED')
  })

  test('notifies the referring doctor when the status changes', async () => {
    const fromDoctor = await createUser('DOCTOR')
    const toDoctor = await createUser('DOCTOR')
    const patient = await createPatient()
    const encounter = await createEncounter(fromDoctor.id, patient.id)
    const referral = await createReferral(encounter.id, fromDoctor.id, toDoctor.id, { reason: 'x' })

    await updateReferralStatus(referral.id, toDoctor.id, 'ACKNOWLEDGED')

    const notification = await Notification.findOne({ user: fromDoctor.id, type: 'referral.status.updated' })
    expect(notification?.entityType).toBe('Referral')
    expect(notification?.entityId).toBe(referral.id)
  })

  test('the REFERRING doctor cannot update the status of their own outgoing referral', async () => {
    const fromDoctor = await createUser('DOCTOR')
    const toDoctor = await createUser('DOCTOR')
    const patient = await createPatient()
    const encounter = await createEncounter(fromDoctor.id, patient.id)
    const referral = await createReferral(encounter.id, fromDoctor.id, toDoctor.id, { reason: 'x' })

    await expect(updateReferralStatus(referral.id, fromDoctor.id, 'ACKNOWLEDGED')).rejects.toMatchObject({
      status: 404,
      code: 'REFERRAL_NOT_FOUND',
    })
  })

  test('an unrelated doctor cannot update the status', async () => {
    const fromDoctor = await createUser('DOCTOR')
    const toDoctor = await createUser('DOCTOR')
    const stranger = await createUser('DOCTOR')
    const patient = await createPatient()
    const encounter = await createEncounter(fromDoctor.id, patient.id)
    const referral = await createReferral(encounter.id, fromDoctor.id, toDoctor.id, { reason: 'x' })

    await expect(updateReferralStatus(referral.id, stranger.id, 'ACKNOWLEDGED')).rejects.toMatchObject({
      status: 404,
    })
  })
})
