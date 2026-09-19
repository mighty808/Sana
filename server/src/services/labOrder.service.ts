import { LabOrder, LAB_ORDER_STATUSES } from '../models/LabOrder.js'
import { LabResult } from '../models/LabResult.js'
import { Encounter } from '../models/Encounter.js'
import { generateId } from '../utils/generateId.js'
import { AppError, assertValidObjectId } from '../utils/apiResponse.js'
import { PUBLIC_USER_FIELDS, type AuthedUser } from '../types/user.js'
import { assertEncounterOpen, mayReadEncounter } from './encounter.service.js'
import { scopeToOwnDoctor, isBrowsingBlocked } from '../utils/queryScope.js'

interface CreateLabOrderInput {
  encounter: string
  tests: Array<{ testName: string }>
  priority?: 'ROUTINE' | 'URGENT'
  clinicalNotes?: string
}

// Requests one or more lab tests during an encounter. `patient` is worked
// out from the encounter rather than taken directly from the request body
// — an order always belongs to whichever patient the encounter is for, so
// there's no valid reason a caller would ever need to specify a different
// one. This is restricted to the assigned doctor only, the same ownership
// rule updateLabOrder uses below, so a different doctor can't place an
// order onto someone else's encounter. A doctor who legitimately has read
// access to that encounter (it was referred to them, or they've treated
// the patient before — see encounter.service.ts's mayReadEncounter) can
// still open it through GET /encounters/:id; they just can't add an order
// to it.
export async function createLabOrder(input: CreateLabOrderInput, doctorId: string) {
  assertValidObjectId(input.encounter, 'encounter')

  const encounter = await Encounter.findOne({ _id: input.encounter, doctor: doctorId })
  if (!encounter) throw new AppError('Encounter not found', 404, 'ENCOUNTER_NOT_FOUND')
  assertEncounterOpen(encounter, 'order lab tests on')

  const labOrderNumber = await generateId('LAB')
  const order = await LabOrder.create({
    labOrderNumber,
    encounter: input.encounter,
    patient: encounter.patient,
    doctor: doctorId,
    tests: input.tests,
    priority: input.priority,
    clinicalNotes: input.clinicalNotes,
  })
  // Populated before returning for the same reason the list/detail
  // functions do it: the client's LabOrder type promises `patient` and
  // `doctor` are full objects on every endpoint returning one, so a create
  // response has to honour that too. `encounter` stays a plain id, which
  // is what the client type declares.
  return order.populate([{ path: 'patient' }, { path: 'doctor', select: PUBLIC_USER_FIELDS }])
}

// Lists lab orders — this is the lab queue.
//   - ADMIN, LAB_TECH: see every order. LAB_TECH is the one actually
//     working the queue, entering and releasing results, while ADMIN just
//     keeps read-only oversight.
//   - DOCTOR: sees only the orders they personally placed, the same
//     doctor-scoping already used for appointments and encounters.
//   - NURSE: holds 'laborder.read' too, but only so the Encounter page's
//     "Lab results" section can load (GET /lab-orders?encounter=, routed
//     to listLabOrdersForEncounter instead — see labOrder.controller.ts).
//     There's no "browse the queue" screen for a nurse, so this plain,
//     unscoped-by-encounter path stays an empty list on purpose, rather
//     than falling through scopeToOwnDoctor's DOCTOR-only check and
//     handing a nurse the entire system's lab queue — the same reasoning
//     invoice.service.ts's listInvoices uses for LAB_TECH.
//   - PATIENT never reaches this function; the route doesn't grant them
//     'laborder.read' at all.
// `statusFilter`, if given, narrows the results further — for example, an
// admin viewing just the ORDERED/PROCESSING items that are still awaiting results.
export async function listLabOrders(user: AuthedUser, statusFilter?: string) {
  if (isBrowsingBlocked(user, ['NURSE'])) return []

  const filter: Record<string, unknown> = {}
  scopeToOwnDoctor(filter, user)
  if (statusFilter) {
    // An unrecognized or mistyped status value gets a clear 400 error here,
    // instead of silently matching zero orders. Without this check, "no
    // orders match" and "your filter value was wrong" would look
    // identical to the caller, hiding a real bug (a typo, or an outdated
    // status name) behind what looks like an empty result.
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

// Lists every lab order opened from one specific encounter, with each
// order's results attached. This powers the "Lab results" section on the
// doctor's Encounter page, which needs to show both what was ordered and
// what's come back so far, without a separate query per order.
//
// Gated by the same rule as the encounter itself (see mayReadEncounter):
// an earlier version of this comment reasoned that the endpoint was safe
// because it was "only reachable through an encounter the caller already
// holds 'encounter.read' for" — but GET /lab-orders?encounter= takes any
// encounter id straight from the query string, so that was a UI-shaped
// assumption, not an actual control. Returns an empty list rather than a
// 404 for an encounter the caller can't read: the page that legitimately
// calls this has already loaded the encounter, so an error here would only
// ever be seen by someone probing ids, and [] tells them nothing.
export async function listLabOrdersForEncounter(encounterId: string, user: AuthedUser) {
  assertValidObjectId(encounterId, 'encounter')
  if (!(await mayReadEncounter(encounterId, user))) return []

  // Populated the same way listLabOrders() and getLabOrderById() always
  // are, since the frontend's LabOrder type expects patient and doctor to
  // always be full objects, never raw ids, no matter which endpoint
  // returned them.
  const orders = await LabOrder.find({ encounter: encounterId })
    .populate([{ path: 'patient' }, { path: 'doctor', select: PUBLIC_USER_FIELDS }])
    .sort({ orderedAt: -1 })
  const orderIds = orders.map((o) => o.id)
  const results = await LabResult.find({ labOrder: { $in: orderIds } }).sort({ resultedAt: 1 })

  // Every order here already carries its own populated `patient` above,
  // and every result on an order belongs to that same patient — so each
  // result reuses its order's patient instead of a second
  // `.populate('patient')` re-fetching the identical document again per
  // result (same reasoning as getLabOrderById's own patient reuse).
  const orderById = new Map(orders.map((o) => [o.id, o]))
  const resultsByOrder = new Map<string, typeof results>()
  for (const result of results) {
    const key = result.labOrder.toString()
    result.patient = orderById.get(key)!.patient
    const existing = resultsByOrder.get(key)
    if (existing) existing.push(result)
    else resultsByOrder.set(key, [result])
  }

  return orders.map((order) => ({ order, results: resultsByOrder.get(order.id) ?? [] }))
}

// Fetches one lab order along with all the results entered against it so
// far. Unlike listLabOrders above, this isn't a per-role queue — an ADMIN
// or LAB_TECH can look up any order by id, which is the whole basis of the
// lab tech's job (their queue is the entire hospital's orders).
//
// A DOCTOR, though, is held to the same rule as the order's own encounter
// (see mayReadEncounter): their list view is already scoped to their own
// orders, so without this they could read any patient's results by trying
// ids — records the app deliberately keeps out of their list. The referral
// and prior-visit cases that rule allows are what keep the legitimate
// cross-doctor views working.
export async function getLabOrderById(id: string, user: AuthedUser) {
  const order = await LabOrder.findById(id).populate([
    { path: 'patient' },
    { path: 'doctor', select: PUBLIC_USER_FIELDS },
  ])
  if (!order) throw new AppError('Lab order not found', 404, 'LAB_ORDER_NOT_FOUND')
  // Reported as a missing lab order, not a missing encounter — the caller
  // asked for an order, and the distinction would itself leak information.
  if (!(await mayReadEncounter(order.encounter.toString(), user))) {
    throw new AppError('Lab order not found', 404, 'LAB_ORDER_NOT_FOUND')
  }

  // Every result on this order belongs to the same patient the order
  // itself already does, so `order.patient` (just populated above) is
  // reused for each one instead of a second `.populate('patient')` here —
  // that would otherwise re-fetch the identical Patient document once per
  // result for no reason.
  const results = await LabResult.find({ labOrder: id }).sort({ resultedAt: 1 })
  for (const result of results) {
    result.patient = order.patient
  }
  return { order, results }
}

interface UpdateLabOrderInput {
  tests: Array<{ testName: string }>
  priority?: 'ROUTINE' | 'URGENT'
  clinicalNotes?: string
}

// Corrects a lab order's requested tests, priority, or notes. This is
// restricted to the doctor who placed the order, using the same
// 404-instead-of-403 pattern used throughout, and only works while the
// order is still ORDERED. Once a lab tech has started entering results
// (PROCESSING) or finished (COMPLETED), changing what tests were requested
// would no longer match the work already done or already in progress, so
// editing is only allowed in this narrower window, separate from the
// encounter's own open/closed check.
export async function updateLabOrder(id: string, doctorId: string, input: UpdateLabOrderInput) {
  const order = await LabOrder.findOne({ _id: id, doctor: doctorId })
  if (!order) throw new AppError('Lab order not found', 404, 'LAB_ORDER_NOT_FOUND')
  if (order.status !== 'ORDERED') {
    throw new AppError('Cannot edit a lab order once results have started coming in', 409, 'LAB_ORDER_IN_PROGRESS')
  }

  // `.set()` is used here instead of assigning `order.tests` directly,
  // because on an already-loaded LabOrder document, TypeScript expects
  // `tests` to be Mongoose's own stricter array type, not the plain
  // objects this input actually has. `.set()` lets Mongoose convert the
  // plain objects for us. createLabOrder above never runs into this,
  // since `.create()` accepts plain data directly. `priority` falls back
  // to the order's existing value when the input doesn't include one, so
  // an edit that leaves priority unmentioned doesn't reset it back to the
  // schema's default.
  order.set({
    tests: input.tests.map((t) => ({ testName: t.testName, status: 'PENDING' })),
    priority: input.priority ?? order.priority,
  })
  // Falls back to the existing note the same way `priority` does above,
  // rather than assigning `input.clinicalNotes` directly. `clinicalNotes`
  // is optional in the schema, so a request that only means to change
  // `tests` (or `priority`) — and simply omits `clinicalNotes` — parses to
  // the exact same `undefined` as a request that means to clear it.
  // Assigning that directly would silently wipe an existing note on any
  // partial update. `tests` doesn't have this problem since it's required,
  // not optional, so it's always genuinely present to fully replace.
  order.clinicalNotes = input.clinicalNotes ?? order.clinicalNotes
  await order.save()
  // Same always-populated contract as createLabOrder above.
  return order.populate([{ path: 'patient' }, { path: 'doctor', select: PUBLIC_USER_FIELDS }])
}
