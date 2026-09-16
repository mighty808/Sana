// The Express half of the /v1/consult contract check. The Python half is
// ai-service/tests/test_contract.py, which keeps
// contract/consult-response.schema.json in step with the Pydantic models.
// This file asserts that what THIS service believes the response looks like
// still satisfies that same schema.
//
// Why it exists: the response shape is restated by hand in six places across
// three languages —
//   1. ai-service/main.py                       (Pydantic — source of truth)
//   2. ai-service/rag/pipeline.py               (the dict consult() builds)
//   3. server/src/services/ai.service.ts        (ConsultResponse interface)
//   4. server/src/models/AiConsultation.ts      (Mongoose sub-schema)
//   5. server/src/test/mockAi.ts                (FakeConsultResponse)
//   6. client/src/types/aiConsultation.ts       (AiSource)
// — and until now nothing checked that they agreed. The comment at the top of
// ai.service.ts says so outright. A field renamed on the Python side would
// have left every one of the 270 backend tests green, because they all run
// against the mock rather than the real service, and only broken in
// production.
//
// This cannot catch everything a real integration test would, since the mock
// is still a mock. What it does catch is the specific failure that mock-based
// testing invites: the mock and the real service quietly diverging.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { Ajv, type ValidateFunction } from 'ajv'

import { AiConsultation } from '../models/AiConsultation.js'
import { DEFAULT_RESPONSE as DEFAULT_MOCK_RESPONSE, type FakeConsultResponse } from './mockAi.js'

// This file is ESM ("type": "module"), so __dirname doesn't exist — resolve
// the repo root relative to this module's own URL instead.
const HERE = path.dirname(fileURLToPath(import.meta.url))
const CONTRACT_PATH = path.resolve(HERE, '../../../contract/consult-response.schema.json')

let validate: ValidateFunction

beforeAll(() => {
  const schema = JSON.parse(readFileSync(CONTRACT_PATH, 'utf-8'))
  // `strict: false` because the generated schema carries Pydantic's own
  // annotations (`title`, `$comment`) that Ajv's strict mode rejects as
  // unknown keywords. They're documentation, not validation rules.
  validate = new Ajv({ strict: false }).compile(schema)
})

// A response in exactly the shape the real ai-service sends — the same shape
// mockAi.ts hands to every test that exercises an AI flow.
const REAL_SHAPED_RESPONSE: FakeConsultResponse = {
  diagnosticGuidance: 'Consider malaria; confirm with an RDT before treating.',
  sources: [
    {
      title: 'Ghana STG — Malaria',
      excerpt: 'Presents with fever (often cyclical), chills/rigors, headache...',
      score: 0.4132,
      grounded: true,
    },
    {
      title: 'Ghana STG — Typhoid Fever',
      excerpt: 'Gradual-onset fever, relative bradycardia, abdominal discomfort...',
      score: 0.0417,
      grounded: false,
    },
  ],
  disclaimer: 'Sana AI provides decision support only — it does not diagnose.',
  ragMetadata: { model: 'openai/gpt-oss-120b', retrievalCount: 5, responseTimeMs: 1840 },
}

describe('the /v1/consult response contract', () => {
  test('a response in the shape mockAi produces satisfies the schema', () => {
    const valid = validate(REAL_SHAPED_RESPONSE)
    expect(validate.errors ?? []).toEqual([])
    expect(valid).toBe(true)
  })

  test('the acuity fields are accepted when present', () => {
    // Only NURSE_VITALS_ANALYSIS sets these, so they have to be optional —
    // but they still have to validate when they do appear.
    const valid = validate({
      ...REAL_SHAPED_RESPONSE,
      acuityLevel: 'CRITICAL',
      acuityReasons: ['Oxygen saturation 85% is critically low'],
    })
    expect(validate.errors ?? []).toEqual([])
    expect(valid).toBe(true)
  })

  test('a response missing diagnosticGuidance is rejected', () => {
    // Proves the validator is actually doing work — a schema that accepts
    // everything would pass every other test in this file.
    const { diagnosticGuidance: _omitted, ...withoutGuidance } = REAL_SHAPED_RESPONSE
    expect(validate(withoutGuidance)).toBe(false)
  })

  test('a source missing its score is rejected', () => {
    const valid = validate({
      ...REAL_SHAPED_RESPONSE,
      sources: [{ title: 'Ghana STG — Malaria', excerpt: 'text' }],
    })
    expect(valid).toBe(false)
  })

  test('a response with no sources at all is rejected', () => {
    // `sources` is required by the Pydantic model, and the real pipeline
    // always populates it — every retrieved passage is returned, grounded or
    // not. This test found that both of this repo's stubs (mockAi.ts's
    // DEFAULT_RESPONSE and e2eServer.ts's fetch stub) were omitting it, i.e.
    // modelling a response the service cannot actually produce. Both now send
    // a realistic shape; this asserts the contract that forced that.
    const valid = validate({
      diagnosticGuidance: 'Guidance without any sources.',
      disclaimer: 'A disclaimer.',
    })
    expect(valid).toBe(false)
  })

  test('the default mock response satisfies the contract', () => {
    // The guard that keeps the two from drifting apart again: whatever
    // mockAi hands to 270 backend tests has to be something the real service
    // could have sent.
    const valid = validate(DEFAULT_MOCK_RESPONSE)
    expect(validate.errors ?? []).toEqual([])
    expect(valid).toBe(true)
  })

  test('the Mongoose schema can store every field the contract allows', () => {
    // The last link in the chain. A response can satisfy the contract and
    // still be dropped on the floor by Mongoose if the model doesn't declare
    // the field — which is how `grounded` would have been silently lost.
    const sourcePaths = AiConsultation.schema.path('response.sources') as unknown as {
      schema: { paths: Record<string, unknown> }
    }
    const declared = Object.keys(sourcePaths.schema.paths)

    for (const field of ['title', 'excerpt', 'score', 'grounded']) {
      expect(declared).toContain(field)
    }
  })
})
