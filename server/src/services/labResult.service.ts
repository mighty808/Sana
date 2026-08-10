import { Types } from 'mongoose'
import { LabResult, type LabResultInterpretation } from '../models/LabResult.js'
import { LabOrder } from '../models/LabOrder.js'
import { Patient } from '../models/Patient.js'
import { AppError, assertValidObjectId } from '../utils/apiResponse.js'
import type { AuthedUser } from '../types/user.js'

interface CreateLabResultInput {
  labOrder: string
  testName: string
  resultValue: string
  unit?: string
  referenceRange?: string
  interpretation?: LabResultInterpretation
  notes?: string
}

// Enters a result for one test within a lab order (staff-only — Admin in
// this MVP). `testName` must match one of the tests actually requested on
// the order, so a result can't be entered for a test nobody ordered.
// After creating the result, the matching test item on the order is marked
// COMPLETED and the order's overall status is recomputed: PROCESSING once
// at least one test is done, COMPLETED once every test has a result.
export async function createLabResult(input: CreateLabResultInput, performedBy: string) {
  assertValidObjectId(input.labOrder, 'labOrder')

  const order = await LabOrder.findById(input.labOrder)
  if (!order) throw new AppError('Lab order not found', 404, 'LAB_ORDER_NOT_FOUND')

  const testItem = order.tests.find((t) => t.testName.toLowerCase() === input.testName.toLowerCase())
  if (!testItem) {
    throw new AppError(`'${input.testName}' was not requested on this lab order`, 400, 'TEST_NOT_ORDERED')
  }

  const result = await LabResult.create({
    labOrder: input.labOrder,
    patient: order.patient,
    performedBy,
    testName: input.testName,
    resultValue: input.resultValue,
    unit: input.unit,
    referenceRange: input.referenceRange,
    interpretation: input.interpretation,
    notes: input.notes,
  })

  // Update the matching test's status and roll up the order's overall
  // status — mutating the already-loaded `order` document in place and
  // saving it, rather than a separate findOneAndUpdate, since we need to
  // inspect ALL of its test items' statuses together to decide the new
  // overall status (a single-field $set can't express "COMPLETED iff every
  // test item is COMPLETED").
  testItem.status = 'COMPLETED'
  const allDone = order.tests.every((t) => t.status === 'COMPLETED')
  order.status = allDone ? 'COMPLETED' : 'PROCESSING'
  await order.save()

  return result
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
