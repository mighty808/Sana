// A standalone process for Playwright's `webServer` (see
// client/playwright.config.ts) — NOT part of the Jest suite (nothing here
// runs under `npm test`). It boots the real Express + Socket.IO app against
// a throwaway in-memory MongoDB, so e2e runs never touch the real Atlas dev
// database, the same principle setupTestDb.ts already applies to the Jest
// suite — just wired up as a long-running server instead of a per-test
// connection.
import { MongoMemoryReplSet } from 'mongodb-memory-server'

// A single-node replica set, not the plain standalone server setupTestDb.ts
// otherwise defaults to — needed because payment.service.ts's
// recordPayment runs inside a real MongoDB transaction, which a standalone
// mongod rejects outright.
async function main() {
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } })

  // Every other module below reads MONGO_URI at import time (see
  // config/env.ts's top-level `required()` calls), so this has to be set
  // BEFORE any of them are imported — which is exactly why they're
  // dynamic imports below, not static ones at the top of this file.
  process.env.MONGO_URI = replSet.getUri()

  // Turns off the login rate limiter for this process only (see
  // middleware/rateLimiter.ts, which ignores this flag entirely in
  // production). A suite that signs in as seven seeded accounts from
  // parallel workers otherwise trips the limit partway through and fails
  // unrelated specs with a 429.
  process.env.E2E_DISABLE_RATE_LIMIT = 'true'

  // Stubs the one real external call in the whole backend —
  // ai.service.ts's callAiService does `fetch(`${env.aiServiceUrl}/v1/consult`,
  // ...)` with no mocking of its own. Same idea as test/mockAi.ts, just
  // reimplemented as a plain function here since jest.spyOn isn't available
  // outside a Jest test — this lets e2e specs exercise AI-touching flows
  // (vitals auto-consult, the Sana AI panel) without the real FastAPI
  // ai-service needing to be running.
  const realFetch = global.fetch
  global.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (url.includes('/v1/consult')) {
      // Shaped like a real response, not a minimal one. `sources` and
      // `ragMetadata` are here because the real service always sends them
      // (sources is required on the Pydantic model), and a stub that omits
      // them lets a spec pass against a response the service cannot produce —
      // which is exactly what src/test/ai-contract.test.ts now checks for.
      // Two sources either side of the relevance threshold so the e2e suite
      // renders both the grounded and the "not used" chip.
      return new Response(
        JSON.stringify({
          diagnosticGuidance: 'E2E test diagnostic guidance.',
          sources: [
            { title: 'Ghana STG — Malaria', excerpt: 'E2E excerpt.', score: 0.41, grounded: true },
            { title: 'Ghana STG — Burns', excerpt: 'E2E excerpt.', score: 0.03, grounded: false },
          ],
          disclaimer: 'E2E test disclaimer.',
          ragMetadata: { model: 'e2e-test-model', retrievalCount: 2, responseTimeMs: 5 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }
    return realFetch(input, init)
  }) as typeof fetch

  const { connectDB } = await import('../config/db.js')
  const { default: app } = await import('../app.js')
  const { initSocket } = await import('../config/socket.js')
  const { env } = await import('../config/env.js')
  const { seedEssentials } = await import('../utils/seed.js')
  const { seedE2EPatients } = await import('./e2eSeed.js')
  const { logger } = await import('../utils/logger.js')
  const http = await import('node:http')

  await connectDB()
  // Roles + the named test accounts only — deliberately not
  // seedBulkClinicalData()'s randomized patients/appointments/encounters.
  // E2E specs get a small, deterministic starting dataset and create
  // whatever else they need themselves.
  await seedEssentials()
  // Five deterministic patients for specs to list/search/open, one of them
  // linked to the PATIENT login so the patient portal has data. See e2eSeed.ts.
  await seedE2EPatients()

  const server = http.createServer(app)
  initSocket(server)

  server.listen(env.port, () => {
    logger.info(`[e2e] Sana API ready on http://localhost:${env.port} (ephemeral in-memory DB)`)
  })

  // Playwright stops this process (SIGTERM) once the test run ends. A plain
  // `process.on('exit', ...)` can't await async cleanup — the event loop is
  // already shutting down by then — so replSet.stop() (which shuts down a
  // real child mongod process) has to happen in a signal handler that can
  // still run async code before the process actually exits. Without this,
  // repeated e2e runs would leak an orphaned mongod process every time.
  async function shutdown() {
    logger.info('[e2e] Shutting down...')
    await replSet.stop()
    process.exit(0)
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

main().catch((err) => {
  console.error('[e2e] Fatal startup error', err)
  process.exit(1)
})
