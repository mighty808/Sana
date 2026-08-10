// Generates sequential, human-readable reference numbers like "SAN-2026-00001",
// "APT-2026-00421", "INV-2026-01204" (see blueprint section 5.2). These are
// what get shown to hospital staff instead of MongoDB's opaque ObjectIds.
//
// Sequencing strategy: reuse a lightweight "counters" collection with one
// document per (prefix, year) pair, and atomically increment it with
// findOneAndUpdate + $inc. This avoids race conditions if two requests try
// to generate an id for the same prefix at the same time — MongoDB
// serializes the increment, so no two calls can ever get the same number.

import { Schema, model } from 'mongoose'

// One document per "sequence" — e.g. { key: 'SAN-2026', value: 124 } means
// the last patient number issued this year was SAN-2026-00124.
const counterSchema = new Schema({
  key: { type: String, required: true, unique: true },
  value: { type: Number, required: true, default: 0 },
})

const Counter = model('Counter', counterSchema)

// Returns the next id for a given prefix, e.g. generateId('SAN') -> 'SAN-2026-00001'.
// `padLength` controls how many digits the running number is padded to
// (5 digits matches the blueprint's examples: SAN-2026-00001).
export async function generateId(prefix: string, padLength = 5): Promise<string> {
  const year = new Date().getFullYear()
  const key = `${prefix}-${year}`

  // $inc atomically increments (and creates, via upsert, on first use each
  // year) the counter for this prefix+year combination, then returns the
  // NEW value in one round-trip — this is what makes it race-condition-safe.
  const counter = await Counter.findOneAndUpdate(
    { key },
    { $inc: { value: 1 } },
    { upsert: true, returnDocument: 'after' },
  )

  const sequence = String(counter!.value).padStart(padLength, '0')
  return `${key}-${sequence}`
}
