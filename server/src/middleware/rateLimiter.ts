import rateLimit from 'express-rate-limit'
import { env } from '../config/env.js'

// Limits how many login and password-reset requests can come from one IP
// address, to slow down attackers who are guessing passwords or trying
// stolen username/password lists.
// In production this stays at a strict 10 attempts per 15 minutes. In
// development and testing the limit is higher, because switching between
// several test accounts during normal demo use can trigger the strict limit
// long before any real attacker would even notice it. This keeps production
// security tight while avoiding an annoying limit during development.
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: env.nodeEnv === 'production' ? 10 : 30,
  standardHeaders: true, // adds RateLimit-* response headers
  legacyHeaders: false, // disables the older X-RateLimit-* headers
  message: { success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Too many login attempts, try again later' } },
  // The Playwright suite signs in as seven different seeded accounts, from
  // several parallel workers, many times over a run — it blows past even the
  // relaxed 30/15min limit and then fails tests that have nothing to do with
  // auth. This opt-out lets the e2e server (see test/e2eServer.ts, the only
  // thing that sets the flag) turn the limiter off for itself.
  //
  // The `nodeEnv !== 'production'` guard is the important half: setting the
  // variable in a real deployment does nothing, so this can't be used to
  // weaken the protection where it actually matters. The Jest suite doesn't
  // set it either, so rate-limiter.test.ts still exercises the real limit.
  skip: () => env.nodeEnv !== 'production' && process.env.E2E_DISABLE_RATE_LIMIT === 'true',
})

// Limits how many requests one IP address can send to the Sana AI endpoint.
// Each AI query costs real time and money to process (it involves turning
// text into embeddings, searching a vector database, and generating a
// response with an LLM), so we don't want one user overloading the AI
// service with rapid requests.
export const aiRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Too many AI queries, slow down' } },
})
