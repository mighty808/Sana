import { jest } from '@jest/globals'
import { consultAI, explainLabResult, reviewConsultation, listConsultationsForLabOrder } from '../services/ai.service.js'
import { Notification } from '../models/Notification.js'
import { connectTestDb, clearTestDb, disconnectTestDb, DB_BOOT_TIMEOUT_MS } from './setupTestDb.js'
import { createUser, createPatient, createEncounter, createLabOrder, createAiConsultation } from './factories.js'
import { mockAiServiceResponse, mockAiServiceUnavailable } from './mockAi.js'

beforeAll(connectTestDb, DB_BOOT_TIMEOUT_MS)
afterEach(async () => {
  await clearTestDb()
  jest.restoreAllMocks()
})
afterAll(disconnectTestDb, DB_BOOT_TIMEOUT_MS)

describe('consultAI', () => {
  test('the assigned doctor gets a MANUAL consultation back, using the (mocked) AI response', async () => {
    mockAiServiceResponse({ diagnosticGuidance: 'Consider malaria testing.' })
    const doctor = await createUser('DOCTOR')
    const patient = await createPatient()
    const encounter = await createEncounter(doctor.id, patient.id)

    const consultation = await consultAI({ encounter: encounter.id, query: 'What could this be?' }, doctor.id)

    expect(consultation.source).toBe('MANUAL')
    expect(consultation.response?.diagnosticGuidance).toBe('Consider malaria testing.')
  })

  test('a different doctor cannot consult about an encounter that is not theirs', async () => {
    mockAiServiceResponse()
    const owner = await createUser('DOCTOR')
    const stranger = await createUser('DOCTOR')
    const patient = await createPatient()
    const encounter = await createEncounter(owner.id, patient.id)

    await expect(consultAI({ encounter: encounter.id, query: 'x' }, stranger.id)).rejects.toMatchObject({
      status: 404,
      code: 'ENCOUNTER_NOT_FOUND',
    })
  })

  test('surfaces a clean 503 when the AI service is unavailable, rather than a raw network error', async () => {
    mockAiServiceUnavailable()
    const doctor = await createUser('DOCTOR')
    const patient = await createPatient()
    const encounter = await createEncounter(doctor.id, patient.id)

    await expect(consultAI({ encounter: encounter.id, query: 'x' }, doctor.id)).rejects.toMatchObject({
      status: 503,
      code: 'AI_SERVICE_UNAVAILABLE',
    })
  })
})

describe('explainLabResult', () => {
  test('creates a LABTECH_RESULT_ANALYSIS consultation and notifies the LAB TECH who asked, not the doctor', async () => {
    mockAiServiceResponse({ diagnosticGuidance: 'This value is within normal range.' })
    const doctor = await createUser('DOCTOR')
    const labTech = await createUser('LAB_TECH')
    const patient = await createPatient()
    const encounter = await createEncounter(doctor.id, patient.id)
    const order = await createLabOrder(doctor.id, patient.id, encounter.id)
    const { createLabResult } = await import('../services/labResult.service.js')
    const result = await createLabResult({ labOrder: order.id, testName: 'CBC', resultValue: '4.5' }, labTech.id)

    const consultation = await explainLabResult(result.id, labTech.id, 'patient is asymptomatic')

    expect(consultation.source).toBe('LABTECH_RESULT_ANALYSIS')
    expect(consultation.doctor.toString()).toBe(doctor.id)
    // persistAndNotify notifies whoever ASKED the question — consultAI
    // notifies the doctor who asked, this notifies the lab tech who asked
    // — not the encounter's doctor, who never requested this explanation.
    const labTechNotification = await Notification.findOne({ user: labTech.id, type: 'ai.response.ready' })
    expect(labTechNotification).not.toBeNull()
    const doctorNotification = await Notification.findOne({ user: doctor.id, type: 'ai.response.ready' })
    expect(doctorNotification).toBeNull()
  })

  test('rejects a nonexistent lab result', async () => {
    mockAiServiceResponse()
    const labTech = await createUser('LAB_TECH')
    await expect(explainLabResult('507f1f77bcf86cd799439011', labTech.id)).rejects.toMatchObject({
      status: 404,
      code: 'LAB_RESULT_NOT_FOUND',
    })
  })
})

describe('reviewConsultation', () => {
  test('the consultation\'s own doctor can record their review', async () => {
    const doctor = await createUser('DOCTOR')
    const patient = await createPatient()
    const encounter = await createEncounter(doctor.id, patient.id)
    const consultation = await createAiConsultation(encounter.id, doctor.id, patient.id)

    const reviewed = await reviewConsultation(consultation.id, doctor.id, 'ACCEPTED', 'Looks right')
    expect(reviewed.reviewStatus).toBe('ACCEPTED')
    expect(reviewed.doctorComment).toBe('Looks right')
  })

  test('a different doctor cannot review someone else\'s consultation', async () => {
    const owner = await createUser('DOCTOR')
    const stranger = await createUser('DOCTOR')
    const patient = await createPatient()
    const encounter = await createEncounter(owner.id, patient.id)
    const consultation = await createAiConsultation(encounter.id, owner.id, patient.id)

    await expect(reviewConsultation(consultation.id, stranger.id, 'ACCEPTED')).rejects.toMatchObject({
      status: 404,
      code: 'AI_CONSULTATION_NOT_FOUND',
    })
  })
})

describe('listConsultationsForLabOrder', () => {
  test('returns every consultation tied to any result on this order', async () => {
    mockAiServiceResponse()
    const doctor = await createUser('DOCTOR')
    const labTech = await createUser('LAB_TECH')
    const patient = await createPatient()
    const encounter = await createEncounter(doctor.id, patient.id)
    const order = await createLabOrder(doctor.id, patient.id, encounter.id)
    const { createLabResult } = await import('../services/labResult.service.js')
    const result = await createLabResult({ labOrder: order.id, testName: 'CBC', resultValue: '4.5' }, labTech.id)
    await explainLabResult(result.id, labTech.id)

    const consultations = await listConsultationsForLabOrder(order.id)
    expect(consultations).toHaveLength(1)
  })

  test('returns an empty list for an order with no explanations yet', async () => {
    const doctor = await createUser('DOCTOR')
    const patient = await createPatient()
    const encounter = await createEncounter(doctor.id, patient.id)
    const order = await createLabOrder(doctor.id, patient.id, encounter.id)

    await expect(listConsultationsForLabOrder(order.id)).resolves.toEqual([])
  })
})
