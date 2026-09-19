// Note the aliasing below: the service function under test and this
// project's own test factory happen to share the name `createUser` — one
// creates a real account through the public API surface (what an Admin
// does via POST /users), the other is this test file's own fixture
// shortcut used everywhere else in the suite. Aliased to keep them
// visually distinct rather than shadowing one with the other.
import { createUser as createUserAccount, listUsers, listDoctors } from '../services/user.service.js'
import { User } from '../models/User.js'
import { connectTestDb, clearTestDb, disconnectTestDb, DB_BOOT_TIMEOUT_MS } from './setupTestDb.js'
import { createUser as createTestUser } from './factories.js'

beforeAll(connectTestDb, DB_BOOT_TIMEOUT_MS)
afterEach(clearTestDb)
afterAll(disconnectTestDb, DB_BOOT_TIMEOUT_MS)

describe('createUser (service)', () => {
  test('creates an account with a real, populated role', async () => {
    // The DOCTOR Role document has to exist first — in the real app the
    // seed script creates every role upfront; here that's createTestUser's
    // own createRole() side effect, so a throwaway doctor is created first
    // purely to guarantee the Role document exists before the real
    // createUser() call under test runs.
    await createTestUser('DOCTOR')

    const account = await createUserAccount({
      email: 'new.doctor@test.sana',
      password: 'a real password',
      firstName: 'Kwame',
      lastName: 'Doctor',
      role: 'DOCTOR',
    })

    expect(account.email).toBe('new.doctor@test.sana')
    expect(account.role.name).toBe('DOCTOR')
    // toPublicUser()-style callers rely on role being a real populated
    // document (role.permissions readable), not a bare ObjectId.
    expect(Array.isArray(account.role.permissions)).toBe(true)
  })

  test('rejects a duplicate email with a clean 409, not a raw Mongo duplicate-key error', async () => {
    await createTestUser('DOCTOR')
    await createUserAccount({
      email: 'dupe@test.sana',
      password: 'x',
      firstName: 'A',
      lastName: 'B',
      role: 'DOCTOR',
    })

    await expect(
      createUserAccount({ email: 'dupe@test.sana', password: 'y', firstName: 'C', lastName: 'D', role: 'DOCTOR' }),
    ).rejects.toMatchObject({ status: 409, code: 'EMAIL_TAKEN' })
  })

  test('rejects a role name with no matching Role document yet', async () => {
    // Deliberately skips createTestUser (which would create the Role as a
    // side effect) — this is the real "seed script hasn't run yet" case.
    await expect(
      createUserAccount({ email: 'x@test.sana', password: 'x', firstName: 'A', lastName: 'B', role: 'NURSE' }),
    ).rejects.toMatchObject({ status: 500, code: 'ROLE_NOT_FOUND' })
  })
})

describe('listUsers', () => {
  test('returns every user, newest first, with roles populated', async () => {
    const first = await createTestUser('DOCTOR')
    const second = await createTestUser('NURSE')

    const users = await listUsers()

    expect(users.length).toBeGreaterThanOrEqual(2)
    const ids = users.map((u) => u.id)
    expect(ids.indexOf(second.id)).toBeLessThan(ids.indexOf(first.id)) // newest first
    expect(users[0]?.role.name).toBeDefined() // populated, not a bare ObjectId
  })
})

describe('listDoctors', () => {
  test('returns only ACTIVE doctors, sorted by first name', async () => {
    await createTestUser('DOCTOR', { firstName: 'Zainab' })
    await createTestUser('DOCTOR', { firstName: 'Amara' })
    await createTestUser('NURSE') // not a doctor — must not appear

    const doctors = await listDoctors()

    expect(doctors).toHaveLength(2)
    expect(doctors.map((d) => d.firstName)).toEqual(['Amara', 'Zainab'])
  })

  test('excludes an INACTIVE doctor account', async () => {
    const doctor = await createTestUser('DOCTOR')
    await User.updateOne({ _id: doctor.id }, { status: 'INACTIVE' })

    await expect(listDoctors()).resolves.toEqual([])
  })

  test('returns an empty list if the DOCTOR role itself does not exist yet', async () => {
    await expect(listDoctors()).resolves.toEqual([])
  })
})
