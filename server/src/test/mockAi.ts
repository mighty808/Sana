import { jest } from '@jest/globals'
import type { AiAcuityLevel } from '../models/AiConsultation.js'

// Mirrors ai.service.ts's own (unexported) ConsultResponse interface — the
// shape the real FastAPI ai-service sends back from POST /v1/consult. Kept
// in sync by hand for the same reason that interface itself isn't shared
// with the real service: the two only ever talk over plain HTTP.
export interface FakeConsultResponse {
  diagnosticGuidance: string
  sources?: Array<{ title: string; excerpt: string; score: number; grounded?: boolean }>
  disclaimer: string
  ragMetadata?: { model?: string; retrievalCount?: number; responseTimeMs?: number }
  acuityLevel?: AiAcuityLevel
  acuityReasons?: string[]
}

// Exported so src/test/ai-contract.test.ts can assert this is a shape the real
// FastAPI service could actually have produced.
//
// `sources` is here rather than omitted because the real service ALWAYS sends
// it — it's required on the Pydantic model, and the pipeline returns every
// retrieved passage, grounded or not. This stub used to leave it out, which
// meant 270 tests ran against a response shape the service cannot produce.
// The contract test caught it. Two sources, one either side of the relevance
// threshold, so the `grounded` distinction is exercised rather than assumed.
export const DEFAULT_RESPONSE: FakeConsultResponse = {
  diagnosticGuidance: 'Test diagnostic guidance.',
  sources: [
    { title: 'Ghana STG — Malaria', excerpt: 'Test excerpt.', score: 0.41, grounded: true },
    { title: 'Ghana STG — Typhoid Fever', excerpt: 'Test excerpt.', score: 0.04, grounded: false },
  ],
  disclaimer: 'Test disclaimer.',
  ragMetadata: { model: 'test-model', retrievalCount: 2, responseTimeMs: 5 },
}

// Stubs the ONE real external call in the whole backend — ai.service.ts's
// callAiService does `fetch(`${env.aiServiceUrl}/v1/consult`, ...)` with no
// mocking of its own. Without this, any test that exercises consultAI,
// triggerAutoConsult, analyzeVitalsForNurse, or explainLabResult makes a
// real, non-deterministic network call — this already happened once this
// session (addVitals's fire-and-forget triggerAutoConsult reached a real
// locally-running ai-service and crashed after test teardown). Call this
// in a `beforeEach`; the spy is restored by Jest's own `restoreMocks`
// config or an explicit `jest.restoreAllMocks()` in `afterEach`.
//
// Pass `overrides` to test a specific response shape (e.g. an
// acuityLevel of 'CRITICAL' to test the doctor-escalation path).
export function mockAiServiceResponse(overrides: Partial<FakeConsultResponse> = {}) {
  const body: FakeConsultResponse = { ...DEFAULT_RESPONSE, ...overrides }
  return jest.spyOn(global, 'fetch').mockResolvedValue({
    ok: true,
    json: async () => body,
  } as Response)
}

// For a test that specifically needs to prove the "AI service is down"
// path (a 503 AppError) — see callAiService's `!res.ok` branch.
export function mockAiServiceUnavailable() {
  return jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false } as Response)
}
