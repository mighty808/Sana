import supertest from 'supertest'
import app from '../app.js'
import { signAccessToken } from '../services/auth.service.js'
import type { AuthedUser } from '../types/user.js'

// The real Express app, imported directly rather than through server.ts —
// see app.ts's own comment: it's kept separate from the HTTP listener and
// the connectDB() call specifically so tests can exercise real routing,
// middleware, and permission checks without opening a network port or
// touching a real database connection. Callers still have to connect
// Mongoose themselves first (see setupTestDb.ts) — this only wires up HTTP.
export const request = supertest(app)

// A cookie-persisting agent — use this instead of `request` for any flow
// that needs the refresh-token cookie carried across requests (login ->
// refresh -> logout). Plain `request` makes each call independent and
// drops any Set-Cookie the previous response set, same as any two
// unrelated fetch() calls would.
export function newAgent() {
  return supertest.agent(app)
}

// A real, valid "Authorization: Bearer <token>" header for `user` — signed
// with the app's own signAccessToken(), the exact function login() uses, so
// this is indistinguishable from a real logged-in session to
// middleware/auth.ts. Never hand-roll a JWT for tests; if the real signing
// function's shape ever changes, a hand-rolled token would drift out of
// sync silently.
//
// Returns a plain object rather than a tuple so callers can pass it
// straight to superagent's `.set(fields)` form: `.set(authHeader(user))`.
export function authHeader(user: AuthedUser): { Authorization: string } {
  return { Authorization: `Bearer ${signAccessToken(user.id)}` }
}
