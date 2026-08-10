import { Invoice, type InvoiceStatus } from '../models/Invoice.js'
import { Encounter } from '../models/Encounter.js'
import { generateId } from '../utils/generateId.js'
import { AppError, assertValidObjectId, isDuplicateKeyError } from '../utils/apiResponse.js'
import { roundMoney } from '../utils/money.js'
import { resolvePagination } from '../utils/pagination.js'
import type { AuthedUser } from '../types/user.js'
import { listPaymentsForInvoice } from './payment.service.js'
import { getPatientForUser } from './patient.service.js'

// Statuses that still owe money — used both for filtering and for the
// shared outstanding-balance aggregate below.
const OPEN_INVOICE_STATUSES: InvoiceStatus[] = ['UNPAID', 'PARTIALLY_PAID']

// Sums `balance` across every invoice matching `extraMatch` that's still
// open (UNPAID or PARTIALLY_PAID) — the one "how much money is still owed"
// calculation, parameterized by an extra filter so both the admin's
// system-wide total and a single patient's own total go through the same
// pipeline instead of two near-identical copies that could drift apart.
export async function sumOutstandingBalance(extraMatch: Record<string, unknown> = {}): Promise<number> {
  const result = await Invoice.aggregate([
    { $match: { status: { $in: OPEN_INVOICE_STATUSES }, ...extraMatch } },
    { $group: { _id: null, total: { $sum: '$balance' } } },
  ])
  return result[0]?.total ?? 0
}

interface InvoiceItemInput {
  description: string
  qty: number
  unitPrice: number
}

interface CreateInvoiceInput {
  encounter: string
  items: InvoiceItemInput[]
}

// Generates an invoice from an encounter. `patient` is derived from the
// encounter (not caller-supplied) — same reasoning as labOrder.service.ts's
// createLabOrder: a bill always belongs to whichever patient the encounter is for.
//
// Note: despite the blueprint phrasing this as "generate invoice from a
// COMPLETED encounter," nothing here checks encounter.status, and — as of
// this phase — no endpoint anywhere in the codebase can ever transition an
// Encounter to COMPLETED in the first place (see models/Encounter.ts).
// Blocking on that status would make invoice generation entirely
// unreachable today, so rather than add an unenforceable/impossible-to-
// satisfy guard, this is left open until a real encounter-completion flow
// exists in a later phase, at which point this comment (and the route's
// OpenAPI description) should be revisited alongside it.
//
// Each item's `amount` is computed here as qty * unitPrice, rounded to the
// nearest pesewa — never trusted from the request body — so a caller can't
// submit a line item whose amount doesn't actually match its own
// qty/unitPrice and quietly skew the total.
export async function createInvoice(input: CreateInvoiceInput) {
  assertValidObjectId(input.encounter, 'encounter')

  const encounter = await Encounter.findById(input.encounter)
  if (!encounter) throw new AppError('Encounter not found', 404, 'ENCOUNTER_NOT_FOUND')

  // Pre-check for a friendly, specific error message in the common
  // (non-racing) case — but this alone is NOT what prevents double-billing
  // under concurrent requests; the partial unique index on
  // models/Invoice.ts (encounter + isActive) is what actually enforces
  // that at the database level. See the try/catch below.
  const existing = await Invoice.findOne({ encounter: input.encounter, isActive: true })
  if (existing) {
    throw new AppError(
      `Encounter already has an invoice (${existing.invoiceNumber})`,
      409,
      'INVOICE_ALREADY_EXISTS',
    )
  }

  const items = input.items.map((item) => ({
    ...item,
    amount: roundMoney(item.qty * item.unitPrice),
  }))
  const subtotal = roundMoney(items.reduce((sum, item) => sum + item.amount, 0))

  const invoiceNumber = await generateId('INV')

  try {
    return await Invoice.create({
      invoiceNumber,
      patient: encounter.patient,
      encounter: input.encounter,
      items,
      subtotal,
      // No tax/discount logic in this MVP (see the field's comment on
      // models/Invoice.ts) — total starts out equal to subtotal.
      total: subtotal,
      amountPaid: 0,
      balance: subtotal,
    })
  } catch (err) {
    // Closes the race the pre-check above can't: if two requests for the
    // same encounter both passed the findOne check before either wrote,
    // the SECOND create() here collides with the partial unique index and
    // fails with a duplicate-key error, which we turn into the same clean
    // 409 the pre-check gives in the non-racing case.
    if (isDuplicateKeyError(err)) {
      throw new AppError('Encounter already has an invoice', 409, 'INVOICE_ALREADY_EXISTS')
    }
    throw err
  }
}

// Lists invoices. Only ADMIN and PATIENT hold 'invoice.read' at all (see
// types/permissions.ts — Doctor/Nurse have no billing visibility in this
// MVP, matching the blueprint's role table). ADMIN sees everything
// (paginated — an unbounded `.find()` here would eventually return the
// entire invoices collection, unlike patient.service.ts's searchPatients or
// notification.service.ts's listNotifications, which are both capped);
// PATIENT is hard-restricted to their own invoices — like lab-result
// release-gating in Phase 5, this is a direct enforcement of "Patient: view
// own ... invoices," not a "nice to have" scoping choice.
export async function listInvoices(user: AuthedUser, opts: { page?: number; limit?: number } = {}) {
  if (user.role.name === 'PATIENT') {
    const patient = await getPatientForUser(user.id)
    if (!patient) return []
    return Invoice.find({ patient: patient.id }).sort({ createdAt: -1 })
  }

  // ADMIN.
  const { skip, limit } = resolvePagination(opts)
  return Invoice.find().populate('patient').sort({ createdAt: -1 }).skip(skip).limit(limit)
}

// Fetches one invoice with its payment history. For PATIENT, this is
// hard-scoped to their own invoice (not the "broad by permission" precedent
// from Phase 4/5's single-resource GETs) — for the same reason listInvoices
// above hard-restricts them: invoice access for a patient is a blueprint
// requirement, not a staff-convenience default.
export async function getInvoiceById(id: string, user: AuthedUser) {
  const invoice = await Invoice.findById(id).populate('patient')
  if (!invoice) throw new AppError('Invoice not found', 404, 'INVOICE_NOT_FOUND')

  if (user.role.name === 'PATIENT') {
    const patient = await getPatientForUser(user.id)
    // `.populate('patient')` above replaces the raw ObjectId with a full
    // Patient document at runtime, but Mongoose's static types don't
    // reflect that (same reasoning as the identical cast pattern in
    // auth.service.ts) — hence the cast to read `.id` off it here. Guarded
    // with `?.` because populate CAN legitimately return null (an orphaned
    // reference to a patient record that no longer exists) — without the
    // guard, that edge case would throw an uncaught TypeError instead of
    // the intended 404.
    const invoicePatientId = (invoice.patient as unknown as { id: string } | null)?.id
    if (!patient || invoicePatientId !== patient.id) {
      // Same invoice, wrong patient — report 404 rather than 403 so a
      // patient can't use this endpoint to probe which invoice ids exist.
      throw new AppError('Invoice not found', 404, 'INVOICE_NOT_FOUND')
    }
  }

  const payments = await listPaymentsForInvoice(id)
  return { invoice, payments }
}
