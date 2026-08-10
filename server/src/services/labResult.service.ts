import { Types } from 'mongoose'
import { LabResult, type LabResultInterpretation } from '../models/LabResult.js'
import { LabOrder, type LabOrderDoc } from '../models/LabOrder.js'
import { Patient } from '../models/Patient.js'
import { AppError, assertValidObjectId } from '../utils/apiResponse.js'
import type { AuthedUser } from '../types/user.js'
import { notify } from './notification.service.js'

interface CreateLabResultInput {
  labOrder: string
  testName: string
  resultValue: string
  unit?: string
  referenceRange?: string
  interpretation?: LabResultInterpretation
  notes?: string
}

// Escapes regex metacharacters in user-supplied text before it's interpolated
// into a RegExp — otherwise a testName like "CBC (fasting)" would be
// interpreted as a regex group instead of literal parentheses, and could
// throw on truly malformed input (e.g. an unbalanced bracket).
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Enters a result for one test within a lab order (staff-only — Admin in
// this MVP). `testName` must match a currently-PENDING test on the order —
// matching by name AND status (not name alone) means an order with a
// repeated test name (e.g. two "CBC" entries — nothing forbids that) fills
// its slots one at a time correctly, instead of always re-matching the
// first same-named item regardless of whether it's already been resulted.
//
// The match-and-complete step below is a single atomic
// `findOneAndUpdate(...)`, not a load -> mutate -> `.save()` cycle. That
// matters under concurrency: two staff entering results for two different
// tests on the same order at the same time would, with a load/save
// pattern, both load the order before either saved, and the second
// `.save()` would throw an uncaught Mongoose VersionError (optimistic
// concurrency conflict) — turning a legitimate second result entry into a
// 500. An atomic update has no such conflict, since MongoDB serializes
// concurrent writes to the same document itself.
export async function createLabResult(input: CreateLabResultInput, performedBy: string) {
  assertValidObjectId(input.labOrder, 'labOrder')

  const testNamePattern = new RegExp(`^${escapeRegExp(input.testName.trim())}$`, 'i')

  // Uses the plain positional `$` operator (`tests.$.status`), not
  // `arrayFilters` + `$[identifier]` — that distinction matters here:
  // `arrayFilters` updates EVERY array element matching the filter, while
  // `$` updates only the FIRST one matched by the query itself. With a
  // duplicate test name, both PENDING "CBC" items match the same filter —
  // `arrayFilters` would flip both to COMPLETED in one write (verified this
  // the hard way), silently completing an order's second slot without a
  // second result ever being entered for it. `$` correctly touches just one.
  const updatedOrder = await LabOrder.findOneAndUpdate(
    { _id: input.labOrder, tests: { $elemMatch: { testName: testNamePattern, status: 'PENDING' } } },
    { $set: { 'tests.$.status': 'COMPLETED' } },
    { returnDocument: 'after' },
  )

  if (!updatedOrder) {
    // The update matched nothing — either the order doesn't exist at all,
    // or it exists but has no PENDING test with that name (wrong name, or
    // every matching slot was already resulted). Distinguish the two so
    // the error message is actually useful.
    const orderExists = await LabOrder.exists({ _id: input.labOrder })
    if (!orderExists) throw new AppError('Lab order not found', 404, 'LAB_ORDER_NOT_FOUND')
    throw new AppError(
      `'${input.testName}' has no pending slot on this lab order (not requested, or already resulted)`,
      400,
      'TEST_NOT_ORDERED',
    )
  }

  const result = await LabResult.create({
    labOrder: input.labOrder,
    patient: updatedOrder.patient,
    performedBy,
    testName: input.testName,
    resultValue: input.resultValue,
    unit: input.unit,
    referenceRange: input.referenceRange,
    interpretation: input.interpretation,
    notes: input.notes,
  })

  await rollUpLabOrderStatus(updatedOrder)

  return result
}

// Recomputes and persists a lab order's overall status from its current
// test items — COMPLETED once every test item is COMPLETED, PROCESSING
// otherwise (this is only ever called right after a test was just marked
// COMPLETED above, so it never needs to consider reverting to ORDERED).
// Factored into its own function — rather than inlined in createLabResult —
// so any future code path that can change test-item statuses (e.g. a
// future void/correct-result endpoint) reuses this instead of re-deriving
// the same "every test done?" logic a second time.
//
// This second write is a separate atomic update from the one in
// createLabResult above, not part of one bigger transaction — under heavy
// concurrent result entry on the SAME order, it's theoretically possible
// for the derived `status` field to briefly reflect a slightly stale
// PROCESSING/COMPLETED value if two roll-ups interleave. That's a much
// narrower and self-correcting edge case (resolved by the next result
// entered) than the VersionError crash this refactor eliminates, and a
// real hospital's lab results for one order are entered by one person
// working through the order, not raced by multiple staff — so the
// simpler two-step approach here is a deliberate tradeoff, not an oversight.
async function rollUpLabOrderStatus(order: LabOrderDoc): Promise<void> {
  const allDone = order.tests.every((t) => t.status === 'COMPLETED')
  await LabOrder.findByIdAndUpdate(order.id, { status: allDone ? 'COMPLETED' : 'PROCESSING' })
}

// Releases a result, making it visible to the patient (see the `status`
// field's comment on models/LabResult.ts for why this gate exists).
// Rejects re-releasing an already-released result — RELEASED is a one-way
// transition, not something to be toggled back and forth.
export async function releaseLabResult(id: string, releasedBy: string) {
  const result = await LabResult.findById(id)
  if (!result) throw new AppError('Lab result not found', 404, 'LAB_RESULT_NOT_FOUND')
  if (result.status === 'RELEASED') {
    throw new AppError('This result has already been released', 409, 'ALREADY_RELEASED')
  }

  result.status = 'RELEASED'
  // On a hydrated document, `releasedBy`'s type is strictly `ObjectId` (not
  // the looser "string or ObjectId" that Mongoose accepts for plain
  // `.create()`/`.find()` filter objects), so the string id needs an
  // explicit conversion here.
  result.releasedBy = new Types.ObjectId(releasedBy)
  result.releasedAt = new Date()
  await result.save()

  // Real-time push per the blueprint's "lab.result.ready — doctor gets
  // alert when lab result is complete" — fires on RELEASE specifically
  // (not on result entry), matching the demo script's step order: Admin
  // enters results -> releases -> doctor receives the notification.
  // Projected to just the two fields notify() actually needs below —
  // no reason to pull the whole order document (including its full tests
  // array) across the wire on every single result release.
  const order = await LabOrder.findById(result.labOrder).select('doctor labOrderNumber')
  if (order) {
    await notify(order.doctor.toString(), {
      type: 'lab.result.ready',
      title: 'Lab result ready',
      message: `${result.testName} result for order ${order.labOrderNumber} has been released`,
      entityType: 'LabResult',
      entityId: result.id,
    })
  }

  return result
}

// Lists lab results. Like listLabOrders, only ADMIN and DOCTOR hold
// 'labresult.read' broadly — PATIENT also holds it, but is always
// hard-restricted below to their OWN RELEASED results only. That patient
// restriction isn't a "nice to have" scoping choice like the doctor/
// encounter one from Phase 4 — it directly enforces the blueprint's
// "Patient: view own ... APPROVED lab results" requirement, so it applies
// unconditionally regardless of how broad staff-to-staff access is elsewhere.
export async function listLabResults(user: AuthedUser) {
  if (user.role.name === 'PATIENT') {
    const patient = await Patient.findOne({ user: user.id })
    if (!patient) return []
    return LabResult.find({ patient: patient.id, status: 'RELEASED' }).sort({ resultedAt: -1 })
  }

  if (user.role.name === 'DOCTOR') {
    const ownOrderIds = await LabOrder.find({ doctor: user.id }).distinct('_id')
    return LabResult.find({ labOrder: { $in: ownOrderIds } }).sort({ resultedAt: -1 })
  }

  // ADMIN.
  return LabResult.find().sort({ resultedAt: -1 })
}
