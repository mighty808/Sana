// Regression coverage for the two shared scoping helpers in queryScope.ts.
// Both were extracted this session from several hand-rolled, previously
// duplicated copies scattered across encounter/labOrder/invoice services
// (see the file's own comments) — this suite protects the one shared
// implementation everything else now depends on, since a mistake here
// would silently affect every caller at once.
import { scopeToOwnDoctor, isBrowsingBlocked } from '../utils/queryScope.js'
import { connectTestDb, clearTestDb, disconnectTestDb, DB_BOOT_TIMEOUT_MS } from './setupTestDb.js'
import { createUser } from './factories.js'

beforeAll(connectTestDb, DB_BOOT_TIMEOUT_MS)
afterEach(clearTestDb)
afterAll(disconnectTestDb, DB_BOOT_TIMEOUT_MS)

describe('scopeToOwnDoctor', () => {
  test('restricts the filter to the doctor\'s own id when the caller is a DOCTOR', async () => {
    const doctor = await createUser('DOCTOR')
    const filter: Record<string, unknown> = { status: 'IN_PROGRESS' }

    const result = scopeToOwnDoctor(filter, doctor)

    expect(result.doctor).toBe(doctor.id)
    expect(result.status).toBe('IN_PROGRESS') // untouched
  })

  test('leaves the filter untouched for ADMIN', async () => {
    const admin = await createUser('ADMIN')
    const filter: Record<string, unknown> = { status: 'IN_PROGRESS' }

    const result = scopeToOwnDoctor(filter, admin)

    expect(result.doctor).toBeUndefined()
    expect(result).toEqual({ status: 'IN_PROGRESS' })
  })

  test('leaves the filter untouched for NURSE', async () => {
    const nurse = await createUser('NURSE')
    const filter: Record<string, unknown> = {}

    scopeToOwnDoctor(filter, nurse)

    expect(filter.doctor).toBeUndefined()
  })

  test('mutates and returns the same object (callers rely on this)', async () => {
    const doctor = await createUser('DOCTOR')
    const filter: Record<string, unknown> = {}

    const result = scopeToOwnDoctor(filter, doctor)

    expect(result).toBe(filter)
  })
})

describe('isBrowsingBlocked', () => {
  test('blocks a role that appears in the given list', async () => {
    const nurse = await createUser('NURSE')
    expect(isBrowsingBlocked(nurse, ['NURSE'])).toBe(true)
  })

  test('does not block a role absent from the given list', async () => {
    const doctor = await createUser('DOCTOR')
    expect(isBrowsingBlocked(doctor, ['NURSE'])).toBe(false)
  })

  test('checks against every role named in the list, not just the first', async () => {
    const pharmacist = await createUser('PHARMACIST')
    expect(isBrowsingBlocked(pharmacist, ['LAB_TECH', 'PHARMACIST'])).toBe(true)
  })

  test('an empty blocked-roles list blocks nobody', async () => {
    const admin = await createUser('ADMIN')
    expect(isBrowsingBlocked(admin, [])).toBe(false)
  })
})
