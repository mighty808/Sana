import { Types } from 'mongoose'
import { LabResult, type LabResultInterpretation } from '../models/LabResult.js'
import { LabOrder, type LabOrderDoc } from '../models/LabOrder.js'
import { AppError, assertValidObjectId } from '../utils/apiResponse.js'
import type { AuthedUser } from '../types/user.js'
import { notify } from './notification.service.js'
import { getPatientForUser } from './patient.service.js'
import { asPopulated } from '../utils/populate.js'

interface CreateLabResultInput {
  labOrder: string
  testName: string
  resultValue: string
  unit?: string
  referenceRange?: string
  interpretation?: LabResultInterpretation
  notes?: string
}

// Escapes any special regex characters in user-typed text before it's
// used to build a RegExp. Without this, a test name like "CBC (fasting)"
// would have its parentheses read as a regex grouping instead of literal
// characters, and truly malformed input (like an unbalanced bracket)
// could throw an error.
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Enters a result for one test within a lab order. `testName` has to
// match a test on the order that's currently PENDING — matching on both
// the name and the PENDING status, not just the name, means an order
// with a repeated test name (nothing stops an order having two "CBC"
// entries) fills its slots correctly one at a time, instead of always
// matching the first test with that name even if it's already been resulted.
//
// The step that finds the test and marks it complete is one single
// database update, not a separate "load the order, change it, then save
// it" sequence. That matters when two people enter results for two
// different tests on the same order at the same moment: with a
// load-then-save approach, both would load the order before either one
// saved, and the second save would fail with a version conflict error —
// turning a perfectly normal second result entry into a crash. A single
// atomic update avoids that entirely, since MongoDB handles concurrent
// writes to the same document safely on its own.
export async function createLabResult(input: CreateLabResultInput, performedBy: string) {
  assertValidObjectId(input.labOrder, 'labOrder')

  const testNamePattern = new RegExp(`^${escapeRegExp(input.testName.trim())}$`, 'i')

  // This uses MongoDB's positional `$` operator (`tests.$.status`), which
  // updates only the first array element that matched the query. A
  // different approach (`arrayFilters`) would update every matching
  // element instead — with two PENDING "CBC" entries, that would flip
  // both of them to COMPLETED in one write, silently marking the second
  // slot done without a result ever actually being entered for it. `$`
  // correctly touches just the one slot this call is for.
  const updatedOrder = await LabOrder.findOneAndUpdate(
    { _id: input.labOrder, tests: { $elemMatch: { testName: testNamePattern, status: 'PENDING' } } },
    { $set: { 'tests.$.status': 'COMPLETED' } },
    { returnDocument: 'after' },
  )

  if (!updatedOrder) {
    // The update above matched nothing. Either the order doesn't exist at
    // all, or it exists but has no PENDING test with that name — a typo'd
    // name, or every slot with that name was already resulted. Figuring
    // out which of those it is makes the error message actually useful.
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

  // The client's LabResult type promises `patient` is a full object on
  // every endpoint that returns one (listLabResults already populates it),
  // so this create response honours the same contract. `labOrder` and
  // `performedBy` stay plain id strings — that's what the type declares.
  return result.populate({ path: 'patient' })
}

// Recalculates and saves a lab order's overall status based on its
// current tests — COMPLETED once every test is COMPLETED, PROCESSING
// otherwise. This is only ever called right after a test was just marked
// COMPLETED above, so it never has to consider reverting an order back to
// ORDERED. It's kept as its own function, rather than written inline
// inside createLabResult, so any other code that changes a test's status
// later can reuse this instead of recalculating "is everything done?" all
// over again.
//
// This is a separate write from the one in createLabResult above, not
// combined into one bigger all-or-nothing operation. Under very heavy
// concurrent result entry on the exact same order, it's theoretically
// possible for the order's overall status to briefly show a slightly
// out-of-date PROCESSING or COMPLETED value if two of these updates
// overlap. That's a narrow edge case that fixes itself the next time a
// result comes in — a smaller problem than the crash this whole approach
// avoids, and in practice one lab order's results are entered by one
// person working through it, not multiple staff racing each other.
async function rollUpLabOrderStatus(order: LabOrderDoc): Promise<void> {
  const allDone = order.tests.every((t) => t.status === 'COMPLETED')
  await LabOrder.findByIdAndUpdate(order.id, { status: allDone ? 'COMPLETED' : 'PROCESSING' })
}

// Releases a result, which is what makes it visible to the patient (see
// the `status` field's comment in models/LabResult.ts for why results
// start out hidden from the patient). Trying to release a result that's
// already released is rejected — once a result is released it stays
// released, it can't be toggled back and forth.
export async function releaseLabResult(id: string, releasedBy: string) {
  const result = await LabResult.findById(id)
  if (!result) throw new AppError('Lab result not found', 404, 'LAB_RESULT_NOT_FOUND')
  if (result.status === 'RELEASED') {
    throw new AppError('This result has already been released', 409, 'ALREADY_RELEASED')
  }

  result.status = 'RELEASED'
  // `result` here is a real Mongoose document (not a plain filter object),
  // and on a document Mongoose expects `releasedBy` to be an actual
  // ObjectId, not just any string. So the string id passed into this
  // function has to be converted to an ObjectId before it's assigned.
  result.releasedBy = new Types.ObjectId(releasedBy)
  result.releasedAt = new Date()
  await result.save()

  // The doctor gets notified here, when the result is released — not
  // earlier, when it was first entered — because releasing is the step
  // that actually makes the result official and visible. Only the fields
  // notify() actually needs are fetched, rather than the whole order
  // document with its full list of tests, since there's no reason to pull
  // more data than what's needed. `patient` is populated (not just
  // selected as a field) so the notification message can include the
  // patient's actual name, not just the order number.
  const order = await LabOrder.findById(result.labOrder).select('doctor labOrderNumber patient').populate('patient')
  if (order) {
    // `.populate('patient')` above swapped the raw patient id for the full
    // Patient document — asPopulated names that gap for TypeScript so the
    // name fields can be read off it. The `?.` guard matters because
    // populate can genuinely come back null (the referenced Patient was
    // deleted) — without it, a released result would already be saved but
    // this notification step would throw and turn a successful release
    // into a 500. The result staying released either way is correct; only
    // the "let a doctor know" side-effect is skippable.
    const patient = asPopulated<{ firstName: string; lastName: string } | null>(order.patient)
    const patientLabel = patient ? `${patient.firstName} ${patient.lastName} — ` : ''
    await notify(order.doctor.toString(), {
      type: 'lab.result.ready',
      title: 'Lab result ready',
      message: `${patientLabel}${result.testName} result for order ${order.labOrderNumber} has been released`,
      entityType: 'LabResult',
      entityId: result.id,
    })
  }

  // Same always-populated `patient` contract as createLabResult above.
  return result.populate({ path: 'patient' })
}

// Lists lab results. ADMIN, LAB_TECH, and DOCTOR all hold the
// 'labresult.read' permission with no restrictions attached to it. PATIENT
// also holds that permission, but is always restricted below to just
// their own released results, no matter what. That restriction is
// enforced unconditionally, in code, rather than left as just a scoping
// convenience — a patient must never be able to see another patient's lab
// results, or their own results before those results are released.
export async function listLabResults(user: AuthedUser) {
  if (user.role.name === 'PATIENT') {
    const patient = await getPatientForUser(user.id)
    if (!patient) return []
    return LabResult.find({ patient: patient.id, status: 'RELEASED' })
      .populate('patient')
      .sort({ resultedAt: -1 })
  }

  if (user.role.name === 'DOCTOR') {
    const ownOrderIds = await LabOrder.find({ doctor: user.id }).distinct('_id')
    return LabResult.find({ labOrder: { $in: ownOrderIds } })
      .populate('patient')
      .sort({ resultedAt: -1 })
  }

  // ADMIN, LAB_TECH: see every result.
  return LabResult.find().populate('patient').sort({ resultedAt: -1 })
}
