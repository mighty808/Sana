// HTTP-layer coverage for every route module's permission wiring — real
// requests through Express, not direct service-function calls. Service-
// level tests (the other files in this directory) call functions directly
// and never touch routing at all, so a typo'd permission string in a
// route file, or a route accidentally left unprotected, would slip past
// every one of them. This file's only job is to prove: no token -> 401,
// wrong permission -> 403, correct permission -> actually reaches the
// controller. It deliberately does NOT re-test business logic those other
// files already cover — a list endpoint passing through is checked via a
// 200 on an (often empty) array, not by asserting on real data.
// Uses the replica-set variant of the test DB (not the plain standalone
// one most other files use) because the "record a real payment" check
// below goes through payment.service.ts's recordPayment, which uses a
// real MongoDB transaction — rejected outright on a standalone mongod.
// See setupTestDb.ts's connectTestDbWithReplSet and
// invoice-payment.test.ts, which needs the same thing.
import { jest } from '@jest/globals'
import { request, authHeader } from './httpClient.js'
import { connectTestDbWithReplSet, clearTestDb, disconnectTestDbReplSet, DB_BOOT_TIMEOUT_MS } from './setupTestDb.js'
import { createUser, createPatient, createEncounter, createTestInvoice } from './factories.js'
import { mockAiServiceResponse } from './mockAi.js'

beforeAll(connectTestDbWithReplSet, DB_BOOT_TIMEOUT_MS)
afterEach(async () => {
  await clearTestDb()
  jest.restoreAllMocks()
})
afterAll(disconnectTestDbReplSet, DB_BOOT_TIMEOUT_MS)

describe('GET /api/v1/users', () => {
  test('no token -> 401', async () => {
    expect((await request.get('/api/v1/users')).status).toBe(401)
  })
  test('DOCTOR lacks user.manage -> 403', async () => {
    const doctor = await createUser('DOCTOR')
    expect((await request.get('/api/v1/users').set(authHeader(doctor))).status).toBe(403)
  })
  test('ADMIN holds user.manage -> 200', async () => {
    const admin = await createUser('ADMIN')
    expect((await request.get('/api/v1/users').set(authHeader(admin))).status).toBe(200)
  })
})

describe('GET /api/v1/users/doctors', () => {
  test('PATIENT lacks user.readDoctors -> 403', async () => {
    const patientUser = await createUser('PATIENT')
    expect((await request.get('/api/v1/users/doctors').set(authHeader(patientUser))).status).toBe(403)
  })
  test('NURSE holds user.readDoctors -> 200', async () => {
    const nurse = await createUser('NURSE')
    expect((await request.get('/api/v1/users/doctors').set(authHeader(nurse))).status).toBe(200)
  })
})

describe('GET /api/v1/patients', () => {
  test('no token -> 401', async () => {
    expect((await request.get('/api/v1/patients')).status).toBe(401)
  })
  test('LAB_TECH lacks patient.read -> 403', async () => {
    const labTech = await createUser('LAB_TECH')
    expect((await request.get('/api/v1/patients').set(authHeader(labTech))).status).toBe(403)
  })
  test('NURSE holds patient.read -> 200', async () => {
    const nurse = await createUser('NURSE')
    expect((await request.get('/api/v1/patients').set(authHeader(nurse))).status).toBe(200)
  })
})

describe('POST /api/v1/patients', () => {
  test('NURSE holds patient.create -> reaches the controller (201)', async () => {
    const nurse = await createUser('NURSE')
    const res = await request
      .post('/api/v1/patients')
      .set(authHeader(nurse))
      .send({ firstName: 'Ama', lastName: 'Mensah', dob: '1995-05-01', gender: 'FEMALE' })
    expect(res.status).toBe(201)
  })
  test('DOCTOR lacks patient.create -> 403', async () => {
    const doctor = await createUser('DOCTOR')
    const res = await request
      .post('/api/v1/patients')
      .set(authHeader(doctor))
      .send({ firstName: 'x', lastName: 'y', dob: '1995-05-01', gender: 'FEMALE' })
    expect(res.status).toBe(403)
  })
})

describe('GET /api/v1/appointments', () => {
  test('no token -> 401', async () => {
    expect((await request.get('/api/v1/appointments')).status).toBe(401)
  })
  test('LAB_TECH lacks appointment.read -> 403', async () => {
    const labTech = await createUser('LAB_TECH')
    expect((await request.get('/api/v1/appointments').set(authHeader(labTech))).status).toBe(403)
  })
  test('PATIENT holds appointment.read -> 200', async () => {
    const patientUser = await createUser('PATIENT')
    expect((await request.get('/api/v1/appointments').set(authHeader(patientUser))).status).toBe(200)
  })
})

describe('GET /api/v1/encounters', () => {
  test('no token -> 401', async () => {
    expect((await request.get('/api/v1/encounters')).status).toBe(401)
  })
  test('PATIENT lacks encounter.read -> 403', async () => {
    const patientUser = await createUser('PATIENT')
    expect((await request.get('/api/v1/encounters').set(authHeader(patientUser))).status).toBe(403)
  })
  test('DOCTOR holds encounter.read -> 200', async () => {
    const doctor = await createUser('DOCTOR')
    expect((await request.get('/api/v1/encounters').set(authHeader(doctor))).status).toBe(200)
  })
})

describe('GET /api/v1/lab-orders', () => {
  test('no token -> 401', async () => {
    expect((await request.get('/api/v1/lab-orders')).status).toBe(401)
  })
  test('PHARMACIST lacks laborder.read -> 403', async () => {
    const pharmacist = await createUser('PHARMACIST')
    expect((await request.get('/api/v1/lab-orders').set(authHeader(pharmacist))).status).toBe(403)
  })
  test('LAB_TECH holds laborder.read -> 200', async () => {
    const labTech = await createUser('LAB_TECH')
    expect((await request.get('/api/v1/lab-orders').set(authHeader(labTech))).status).toBe(200)
  })
})

describe('GET /api/v1/lab-results', () => {
  test('no token -> 401', async () => {
    expect((await request.get('/api/v1/lab-results')).status).toBe(401)
  })
  test('NURSE lacks labresult.read -> 403', async () => {
    const nurse = await createUser('NURSE')
    expect((await request.get('/api/v1/lab-results').set(authHeader(nurse))).status).toBe(403)
  })
  test('DOCTOR holds labresult.read -> 200', async () => {
    const doctor = await createUser('DOCTOR')
    expect((await request.get('/api/v1/lab-results').set(authHeader(doctor))).status).toBe(200)
  })
})

describe('GET /api/v1/notifications', () => {
  // Every role holds notification.read, so there is no legitimate 403
  // case to test here — only that the route is genuinely behind auth.
  test('no token -> 401', async () => {
    expect((await request.get('/api/v1/notifications')).status).toBe(401)
  })
  test('any authenticated role -> 200', async () => {
    const doctor = await createUser('DOCTOR')
    expect((await request.get('/api/v1/notifications').set(authHeader(doctor))).status).toBe(200)
  })
})

describe('GET /api/v1/invoices', () => {
  test('no token -> 401', async () => {
    expect((await request.get('/api/v1/invoices')).status).toBe(401)
  })
  test('DOCTOR lacks invoice.read -> 403', async () => {
    const doctor = await createUser('DOCTOR')
    expect((await request.get('/api/v1/invoices').set(authHeader(doctor))).status).toBe(403)
  })
  test('ADMIN holds invoice.read -> 200', async () => {
    const admin = await createUser('ADMIN')
    expect((await request.get('/api/v1/invoices').set(authHeader(admin))).status).toBe(200)
  })
})

describe('POST /api/v1/payments', () => {
  test('no token -> 401', async () => {
    expect((await request.post('/api/v1/payments').send({})).status).toBe(401)
  })
  test('DOCTOR lacks payment.create -> 403', async () => {
    const doctor = await createUser('DOCTOR')
    expect((await request.post('/api/v1/payments').set(authHeader(doctor)).send({})).status).toBe(403)
  })
  test('ADMIN holds payment.create -> reaches the controller and records a real payment (201)', async () => {
    const admin = await createUser('ADMIN')
    const doctor = await createUser('DOCTOR')
    const patient = await createPatient()
    const encounter = await createEncounter(doctor.id, patient.id)
    const invoice = await createTestInvoice(patient.id, encounter.id, { total: 100 })

    const res = await request
      .post('/api/v1/payments')
      .set(authHeader(admin))
      .send({ invoice: invoice.id, amount: 50, method: 'CASH' })
    expect(res.status).toBe(201)
  })
})

describe('POST /api/v1/ai/consult', () => {
  test('no token -> 401', async () => {
    expect((await request.post('/api/v1/ai/consult').send({})).status).toBe(401)
  })
  test('NURSE lacks ai.consult -> 403', async () => {
    const nurse = await createUser('NURSE')
    expect((await request.post('/api/v1/ai/consult').set(authHeader(nurse)).send({})).status).toBe(403)
  })
  test('DOCTOR holds ai.consult -> reaches the controller (mocked AI response)', async () => {
    mockAiServiceResponse()
    const doctor = await createUser('DOCTOR')
    const patient = await createPatient()
    const encounter = await createEncounter(doctor.id, patient.id)

    const res = await request
      .post('/api/v1/ai/consult')
      .set(authHeader(doctor))
      .send({ encounter: encounter.id, query: 'What could this be?' })
    expect(res.status).toBe(201)
  })
})

describe('GET /api/v1/analytics/dashboard', () => {
  // Every role gets its own dashboard shape, so there's no 403 case here either.
  test('no token -> 401', async () => {
    expect((await request.get('/api/v1/analytics/dashboard')).status).toBe(401)
  })
  test('any authenticated role -> 200', async () => {
    const doctor = await createUser('DOCTOR')
    expect((await request.get('/api/v1/analytics/dashboard').set(authHeader(doctor))).status).toBe(200)
  })
})

describe('GET /api/v1/analytics/trends', () => {
  test('DOCTOR lacks analytics.readTrends -> 403', async () => {
    const doctor = await createUser('DOCTOR')
    expect((await request.get('/api/v1/analytics/trends').set(authHeader(doctor))).status).toBe(403)
  })
  test('ADMIN holds analytics.readTrends -> 200', async () => {
    const admin = await createUser('ADMIN')
    expect((await request.get('/api/v1/analytics/trends').set(authHeader(admin))).status).toBe(200)
  })
})

describe('GET /api/v1/audit-logs', () => {
  test('no token -> 401', async () => {
    expect((await request.get('/api/v1/audit-logs')).status).toBe(401)
  })
  test('DOCTOR lacks auditlog.read -> 403', async () => {
    const doctor = await createUser('DOCTOR')
    expect((await request.get('/api/v1/audit-logs').set(authHeader(doctor))).status).toBe(403)
  })
  test('ADMIN holds auditlog.read -> 200', async () => {
    const admin = await createUser('ADMIN')
    expect((await request.get('/api/v1/audit-logs').set(authHeader(admin))).status).toBe(200)
  })
})

describe('GET /api/v1/referrals', () => {
  test('no token -> 401', async () => {
    expect((await request.get('/api/v1/referrals')).status).toBe(401)
  })
  test('NURSE lacks referral.read -> 403', async () => {
    const nurse = await createUser('NURSE')
    expect((await request.get('/api/v1/referrals').set(authHeader(nurse))).status).toBe(403)
  })
  test('DOCTOR holds referral.read -> 200', async () => {
    const doctor = await createUser('DOCTOR')
    expect((await request.get('/api/v1/referrals').set(authHeader(doctor))).status).toBe(200)
  })
})

describe('GET /api/v1/prescriptions', () => {
  test('no token -> 401', async () => {
    expect((await request.get('/api/v1/prescriptions')).status).toBe(401)
  })
  test('NURSE lacks prescription.read -> 403', async () => {
    const nurse = await createUser('NURSE')
    expect((await request.get('/api/v1/prescriptions').set(authHeader(nurse))).status).toBe(403)
  })
  test('PHARMACIST holds prescription.read -> 200', async () => {
    const pharmacist = await createUser('PHARMACIST')
    expect((await request.get('/api/v1/prescriptions').set(authHeader(pharmacist))).status).toBe(200)
  })
})
