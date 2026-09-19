// HTTP-layer coverage for the auth routes — real requests through Express,
// exercising routing, Zod validation, the login rate limiter, and cookie
// handling, none of which auth.test.ts's direct service-function calls can
// see. Kept to a small number of /login hits: loginRateLimiter allows 30
// per 15 minutes outside production, and Jest gives this file its own
// module registry, so the limiter's in-memory count here is isolated from
// every other test file — but not from other tests *within* this one file.
import { request, newAgent, authHeader } from './httpClient.js'
import { connectTestDb, clearTestDb, disconnectTestDb, DB_BOOT_TIMEOUT_MS } from './setupTestDb.js'
import { createUser } from './factories.js'

beforeAll(connectTestDb, DB_BOOT_TIMEOUT_MS)
afterEach(clearTestDb)
afterAll(disconnectTestDb, DB_BOOT_TIMEOUT_MS)

const PASSWORD = 'correct horse battery staple'

describe('POST /api/v1/auth/login', () => {
  test('succeeds with the right credentials — returns an access token and sets the refresh cookie', async () => {
    const user = await createUser('DOCTOR', { password: PASSWORD })

    const res = await request.post('/api/v1/auth/login').send({ email: user.email, password: PASSWORD })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(typeof res.body.data.accessToken).toBe('string')
    expect(res.body.data.user.id).toBe(user.id)
    // toPublicUser() must never leak the password hash.
    expect(res.body.data.user.passwordHash).toBeUndefined()
    const setCookie = res.headers['set-cookie'] as unknown as string[]
    expect(setCookie.some((c) => c.startsWith('refreshToken='))).toBe(true)
  })

  test('rejects the wrong password with 401', async () => {
    const user = await createUser('DOCTOR', { password: PASSWORD })
    const res = await request.post('/api/v1/auth/login').send({ email: user.email, password: 'wrong' })
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS')
  })

  test('rejects a malformed request body with 422 before it ever reaches the service layer', async () => {
    const res = await request.post('/api/v1/auth/login').send({ email: 'not-an-email' })
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })
})

describe('POST /api/v1/auth/refresh', () => {
  test('rejects a request with no refresh cookie at all', async () => {
    const res = await request.post('/api/v1/auth/refresh')
    expect(res.status).toBe(401)
  })

  test('issues a new access token when the refresh cookie is valid', async () => {
    const user = await createUser('DOCTOR', { password: PASSWORD })
    const agent = newAgent()
    await agent.post('/api/v1/auth/login').send({ email: user.email, password: PASSWORD })

    const res = await agent.post('/api/v1/auth/refresh')

    expect(res.status).toBe(200)
    expect(typeof res.body.data.accessToken).toBe('string')
  })
})

describe('POST /api/v1/auth/logout', () => {
  test('rejects a request with no access token', async () => {
    const res = await request.post('/api/v1/auth/logout')
    expect(res.status).toBe(401)
  })

  test('logs out with a valid access token and revokes the refresh cookie session', async () => {
    const user = await createUser('DOCTOR', { password: PASSWORD })
    const agent = newAgent()
    await agent.post('/api/v1/auth/login').send({ email: user.email, password: PASSWORD })

    const logoutRes = await agent.post('/api/v1/auth/logout').set(authHeader(user))
    expect(logoutRes.status).toBe(200)

    // The refresh token issued at login is now revoked server-side
    // (tokenVersion bumped) — the same cookie must no longer work.
    const refreshRes = await agent.post('/api/v1/auth/refresh')
    expect(refreshRes.status).toBe(401)
  })
})
