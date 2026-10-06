// Proves loginRateLimiter actually blocks once its limit is reached — not
// just that the middleware is wired in (auth-routes.test.ts already shows
// requests succeed under the limit), but that request #31 genuinely gets
// rejected. This needs its own file: the limiter's in-memory counter is
// created once when rateLimiter.ts is first imported and lives for the
// life of that module instance, and Jest gives each test FILE its own
// fresh module registry — sharing this file with any other login-hitting
// test would let earlier requests eat into this test's own count (or vice
// versa), whichever runs first.
import { request } from './httpClient.js'
import { connectTestDb, disconnectTestDb, DB_BOOT_TIMEOUT_MS } from './setupTestDb.js'

// A developer's local .env can set E2E_DISABLE_RATE_LIMIT (it exists for the
// Playwright server), and dotenv loads that into every Jest run too — which
// switches the limiter off and makes this file fail with 401/200 where it
// expects 429. This file tests the real limit, so make sure the opt-out is
// off for it, whatever the local environment says. The limiter reads the
// variable on each request, so clearing it here is early enough.
beforeAll(() => {
  delete process.env.E2E_DISABLE_RATE_LIMIT
})

beforeAll(connectTestDb, DB_BOOT_TIMEOUT_MS)
afterAll(disconnectTestDb, DB_BOOT_TIMEOUT_MS)

// Matches rateLimiter.ts's own non-production limit exactly — a fixed
// constant here rather than importing env.nodeEnv, so this test does what
// it says regardless of how NODE_ENV happens to be set for the run (Jest
// itself defaults it to 'test', which the limiter treats the same as
// 'development': 30, not the stricter production limit of 10).
const NON_PRODUCTION_LOGIN_LIMIT = 30

describe('loginRateLimiter', () => {
  test('the 31st login attempt from the same client in the window is rejected with 429', async () => {
    // Bogus credentials — the limiter counts every request regardless of
    // outcome (no skipSuccessfulRequests/skipFailedRequests set), and a
    // guaranteed-to-fail login skips the cost of hashing a real password.
    const attempt = () => request.post('/api/v1/auth/login').send({ email: 'nobody@test.sana', password: 'x' })

    for (let i = 0; i < NON_PRODUCTION_LOGIN_LIMIT; i++) {
      const res = await attempt()
      // Every one of these is still under the limit — none should be 429.
      expect(res.status).not.toBe(429)
    }

    const oneOver = await attempt()
    expect(oneOver.status).toBe(429)
    expect(oneOver.body.error.code).toBe('TOO_MANY_REQUESTS')
  }, 30_000)

  test('forgot-password shares the SAME limiter as login — hits on one count against the other', async () => {
    // A fresh client identity within this test isn't really achievable
    // (supertest requests all come from the same local connection), so
    // this deliberately runs in the same file, after the previous test has
    // already exhausted the shared limiter for this process — proving
    // forgot-password is blocked too, by the very state login's test left behind.
    const res = await request.post('/api/v1/auth/forgot-password').send({ email: 'nobody@test.sana' })
    expect(res.status).toBe(429)
  })
})
