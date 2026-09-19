import { createReferral, listReferralMessages, sendReferralMessage } from '../services/referral.service.js'
import { Notification } from '../models/Notification.js'
import { connectTestDb, clearTestDb, disconnectTestDb, DB_BOOT_TIMEOUT_MS } from './setupTestDb.js'
import { createUser, createPatient, createEncounter } from './factories.js'

beforeAll(connectTestDb, DB_BOOT_TIMEOUT_MS)
afterEach(clearTestDb)
afterAll(disconnectTestDb, DB_BOOT_TIMEOUT_MS)

// Shared setup for every test below: a referral from fromDoctor to
// toDoctor, exactly like referral.test.ts's own fixtures.
async function setupReferral() {
  const fromDoctor = await createUser('DOCTOR')
  const toDoctor = await createUser('DOCTOR')
  const patient = await createPatient()
  const encounter = await createEncounter(fromDoctor.id, patient.id)
  const referral = await createReferral(encounter.id, fromDoctor.id, toDoctor.id, { reason: 'Cardiology opinion' })
  return { fromDoctor, toDoctor, patient, encounter, referral }
}

describe('sendReferralMessage', () => {
  test('the referring doctor can send a message, and the receiving doctor is notified', async () => {
    const { fromDoctor, toDoctor, referral } = await setupReferral()

    const message = await sendReferralMessage(referral.id, fromDoctor.id, 'Can you see them today?')

    expect(message.body).toBe('Can you see them today?')
    expect(message.sender.toString()).toBe(fromDoctor.id)

    const notification = await Notification.findOne({ user: toDoctor.id, type: 'referral.message.created' })
    expect(notification?.entityType).toBe('Referral')
    expect(notification?.entityId).toBe(referral.id)
  })

  test('the receiving doctor can reply, and the referring doctor (not the sender) is notified', async () => {
    const { fromDoctor, toDoctor, referral } = await setupReferral()

    await sendReferralMessage(referral.id, toDoctor.id, 'Yes, send them over.')

    const notifiedSender = await Notification.findOne({ user: fromDoctor.id, type: 'referral.message.created' })
    expect(notifiedSender).not.toBeNull()
    const notifiedRecipientThemselves = await Notification.findOne({ user: toDoctor.id, type: 'referral.message.created' })
    expect(notifiedRecipientThemselves).toBeNull()
  })

  test('a doctor who is neither fromDoctor nor toDoctor cannot send a message', async () => {
    const { referral } = await setupReferral()
    const stranger = await createUser('DOCTOR')

    await expect(sendReferralMessage(referral.id, stranger.id, 'hi')).rejects.toMatchObject({
      status: 404,
      code: 'REFERRAL_NOT_FOUND',
    })
  })
})

describe('listReferralMessages', () => {
  test('returns the thread oldest-first for either participant', async () => {
    const { fromDoctor, toDoctor, referral } = await setupReferral()
    await sendReferralMessage(referral.id, fromDoctor.id, 'first')
    await sendReferralMessage(referral.id, toDoctor.id, 'second')

    const forSender = await listReferralMessages(referral.id, fromDoctor.id)
    const forRecipient = await listReferralMessages(referral.id, toDoctor.id)

    expect(forSender.map((m) => m.body)).toEqual(['first', 'second'])
    expect(forRecipient.map((m) => m.body)).toEqual(['first', 'second'])
  })

  test('a stranger cannot list the thread', async () => {
    const { referral } = await setupReferral()
    const stranger = await createUser('DOCTOR')

    await expect(listReferralMessages(referral.id, stranger.id)).rejects.toMatchObject({
      status: 404,
      code: 'REFERRAL_NOT_FOUND',
    })
  })
})
