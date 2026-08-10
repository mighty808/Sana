import { LabOrder, LAB_ORDER_STATUSES } from '../models/LabOrder.js'
import { LabResult } from '../models/LabResult.js'
import { Encounter } from '../models/Encounter.js'
import { generateId } from '../utils/generateId.js'
import { AppError, assertValidObjectId } from '../utils/apiResponse.js'
import { PUBLIC_USER_FIELDS, type AuthedUser } from '../types/user.js'

interface CreateLabOrderInput {
  encounter: string
  tests: Array<{ testName: string }>
  priority?: 'ROUTINE' | 'URGENT'
  clinicalNotes?: string
}

// Requests one or more lab tests during an encounter. `patient` is derived
// from the encounter rather than accepted directly in the request body —
// an order always belongs to whichever patient the encounter is for, so
// there's no legitimate reason a caller would need to (or should be able
// to) specify a different one.
export async function createLabOrder(input: CreateLabOrderInput, doctorId: string) {
  assertValidObjectId(input.encounter, 'encounter')

  const encounter = await Encounter.findById(input.encounter)
  if (!encounter) throw new AppError('Encounter not found', 404, 'ENCOUNTER_NOT_FOUND')

  const labOrderNumber = await generateId('LAB')
  return LabOrder.create({
    labOrderNumber,
    encounter: input.encounter,
    patient: encounter.patient,
    doctor: doctorId,
    tests: input.tests,
    priority: input.priority,
    clinicalNotes: input.clinicalNotes,
  })
}

// Lists lab orders — this is the "lab queue" from the blueprint's REST
// table. Only ADMIN and DOCTOR ever reach this function in practice (NURSE
// and PATIENT don't hold 'laborder.read' — see types/permissions.ts — so
// the route's requirePermission check blocks them before the service runs):
//   - ADMIN: sees every order (they're the one actually working the queue,
//     entering results, since there's no separate Lab Technician role in the MVP).
//   - DOCTOR: sees only orders they placed — mirrors the same
//     doctor-scoping already established for appointments/encounters.
// `statusFilter`, if given, narrows further (e.g. an admin viewing just the
// ORDERED/PROCESSING items still awaiting results).
export async function listLabOrders(user: AuthedUser, statusFilter?: string) {
  const filter: Record<string, unknown> = {}
  if (user.role.name === 'DOCTOR') filter.doctor = user.id
  if (statusFilter) {
    // Reject an unrecognized/mistyped status value with a clear 400 instead
    // of silently matching zero documents — an empty list and "your filter
    // value was invalid" look identical to the caller otherwise, masking a
    // client bug (e.g. wrong case, stale enum) as "no orders."
    if (!LAB_ORDER_STATUSES.includes(statusFilter as (typeof LAB_ORDER_STATUSES)[number])) {
      throw new AppError(
        `Invalid status filter '${statusFilter}' — expected one of ${LAB_ORDER_STATUSES.join(', ')}`,
        400,
        'INVALID_STATUS',
      )
    }
    filter.status = statusFilter
  }

  return LabOrder.find(filter)
    .populate([{ path: 'patient' }, { path: 'doctor', select: PUBLIC_USER_FIELDS }])
    .sort({ orderedAt: -1 })
}

// Fetches one lab order with all results entered against it so far.
// Deliberately NOT scoped to the requesting doctor's own orders (unlike
// listLabOrders above) — this matches the same precedent set for
// GET /encounters/:id in Phase 4: list views are personalized queues, but a
// direct-by-id lookup (e.g. following a link) stays broadly accessible to
// any user holding the role permission, not restricted to the assigned
// doctor. That was an explicit choice made with the project owner for
// encounters, and is applied consistently here rather than re-litigated
// per resource type.
export async function getLabOrderById(id: string) {
  const order = await LabOrder.findById(id).populate([
    { path: 'patient' },
    { path: 'doctor', select: PUBLIC_USER_FIELDS },
  ])
  if (!order) throw new AppError('Lab order not found', 404, 'LAB_ORDER_NOT_FOUND')

  const results = await LabResult.find({ labOrder: id }).sort({ resultedAt: 1 })
  return { order, results }
}
