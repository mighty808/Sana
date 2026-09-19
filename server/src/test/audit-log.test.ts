import type { Request } from 'express'
import { logAction } from '../services/audit.service.js'
import { listAuditLogs } from '../services/auditLog.service.js'
import { connectTestDb, clearTestDb, disconnectTestDb, DB_BOOT_TIMEOUT_MS } from './setupTestDb.js'
import { createUser } from './factories.js'

beforeAll(connectTestDb, DB_BOOT_TIMEOUT_MS)
afterEach(clearTestDb)
afterAll(disconnectTestDb, DB_BOOT_TIMEOUT_MS)

// logAction only ever reads `req.ip` — a minimal fake is enough, cast to
// Request rather than constructing (or mocking) a real Express request.
function fakeRequest(ip = '127.0.0.1'): Request {
  return { ip } as Request
}

describe('logAction', () => {
  test('records who did what, to which resource, with metadata and IP', async () => {
    const user = await createUser('ADMIN')

    await logAction(fakeRequest('10.0.0.5'), user.id, 'PATIENT_CREATED', 'Patient', 'abc123', { note: 'walk-in' })

    const { logs } = await listAuditLogs({})
    expect(logs).toHaveLength(1)
    expect(logs[0]?.action).toBe('PATIENT_CREATED')
    expect(logs[0]?.resource).toBe('Patient')
    expect(logs[0]?.resourceId).toBe('abc123')
    expect(logs[0]?.ipAddress).toBe('10.0.0.5')
    expect(logs[0]?.metadata).toMatchObject({ note: 'walk-in' })
  })

  test('userId can be omitted (e.g. a failed login for an email that is not registered)', async () => {
    await logAction(fakeRequest(), undefined, 'LOGIN_FAILURE', 'User', undefined, { email: 'nobody@test.sana' })

    const { logs } = await listAuditLogs({})
    expect(logs).toHaveLength(1)
    expect(logs[0]?.user).toBeUndefined()
  })
})

describe('listAuditLogs', () => {
  test('lists newest first', async () => {
    const user = await createUser('ADMIN')
    await logAction(fakeRequest(), user.id, 'FIRST', 'Patient', undefined)
    await logAction(fakeRequest(), user.id, 'SECOND', 'Patient', undefined)

    const { logs, total } = await listAuditLogs({})
    expect(total).toBe(2)
    expect(logs[0]?.action).toBe('SECOND')
  })

  test('filters by action', async () => {
    const user = await createUser('ADMIN')
    await logAction(fakeRequest(), user.id, 'LOGIN_SUCCESS', 'User', undefined)
    await logAction(fakeRequest(), user.id, 'LOGOUT', 'User', undefined)

    const { logs } = await listAuditLogs({ action: 'LOGOUT' })
    expect(logs).toHaveLength(1)
    expect(logs[0]?.action).toBe('LOGOUT')
  })

  test('filters by resource', async () => {
    const user = await createUser('ADMIN')
    await logAction(fakeRequest(), user.id, 'CREATED', 'Patient', undefined)
    await logAction(fakeRequest(), user.id, 'CREATED', 'Appointment', undefined)

    const { logs } = await listAuditLogs({ resource: 'Appointment' })
    expect(logs).toHaveLength(1)
    expect(logs[0]?.resource).toBe('Appointment')
  })

  test('filters by user', async () => {
    const userA = await createUser('ADMIN')
    const userB = await createUser('ADMIN')
    await logAction(fakeRequest(), userA.id, 'ACTION', 'X', undefined)
    await logAction(fakeRequest(), userB.id, 'ACTION', 'X', undefined)

    const { logs } = await listAuditLogs({ user: userA.id })
    expect(logs).toHaveLength(1)
  })

  test('rejects an invalid user id filter with a clean 400', async () => {
    await expect(listAuditLogs({ user: 'not-an-id' })).rejects.toMatchObject({
      status: 400,
      code: 'INVALID_ID',
    })
  })
})
