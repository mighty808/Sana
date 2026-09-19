import { Invoice, type InvoiceStatus } from '../models/Invoice.js'
import { LabOrder } from '../models/LabOrder.js'
import { Prescription } from '../models/Prescription.js'
import { generateId } from '../utils/generateId.js'
import { AppError, assertValidObjectId, isDuplicateKeyError } from '../utils/apiResponse.js'
import { roundMoney } from '../utils/money.js'
import { resolvePagination } from '../utils/pagination.js'
import type { AuthedUser } from '../types/user.js'
import { listPaymentsForInvoice } from './payment.service.js'
import { getPatientForUser } from './patient.service.js'
import { asPopulated } from '../utils/populate.js'
import { isBrowsingBlocked } from '../utils/queryScope.js'

// Statuses that still owe money — used both for filtering and for the
// shared outstanding-balance aggregate below.
const OPEN_INVOICE_STATUSES: InvoiceStatus[] = ['UNPAID', 'PARTIALLY_PAID']

// Adds up the `balance` field across every invoice matching `extraMatch`
// that's still open (UNPAID or PARTIALLY_PAID). This is the one place
// that calculates "how much money is still owed" — the admin's
// system-wide total and a single patient's own total both call this with
// a different filter, instead of each having its own near-identical copy
// of the same calculation.
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
  labOrder?: string
  prescription?: string
  items: InvoiceItemInput[]
}

// Creates an invoice from exactly one billable thing — a lab order or a
// prescription — one invoice per source, billing exactly its tests or
// medications. `patient` and `encounter` are looked up from that source
// document, not taken from whatever the caller sends, for the same reason
// labOrder.service.ts's createLabOrder does the same thing: a bill always
// belongs to whichever patient and encounter the thing it's billing
// actually belongs to.
//
// Each item's `amount` is calculated here as qty times unitPrice, rounded
// to the nearest pesewa — it's never taken directly from the request
// body, so a caller can't submit a line item whose amount doesn't
// actually match its own qty and unitPrice and quietly throw off the total.
export async function createInvoice(input: CreateInvoiceInput) {
  // schemas/invoice.ts's zod refine already guarantees exactly one of
  // these is set before this ever runs, but the service layer doesn't
  // trust the route layer alone for something this load-bearing (the same
  // reasoning behind every other AppError check in this file that zod
  // could theoretically have already ruled out).
  if (Boolean(input.labOrder) === Boolean(input.prescription)) {
    throw new AppError('Provide exactly one of labOrder or prescription', 400, 'INVALID_INVOICE_SOURCE')
  }

  // Everything that differs between the two billable sources — the
  // friendly name used in error messages, the duplicate-invoice filter,
  // and which of Invoice's two source fields gets set — is derived once
  // here, at the one point that already has to branch on which source was
  // given. Nothing below this branches on labOrder-vs-prescription again.
  const source = input.labOrder
    ? await (async () => {
        assertValidObjectId(input.labOrder!, 'labOrder')
        const labOrder = await LabOrder.findById(input.labOrder)
        if (!labOrder) throw new AppError('Lab order not found', 404, 'LAB_ORDER_NOT_FOUND')
        return {
          doc: labOrder,
          label: 'lab order',
          duplicateFilter: { labOrder: labOrder.id, isActive: true },
          fields: { labOrder: labOrder.id as string | undefined, prescription: undefined as string | undefined },
        }
      })()
    : await (async () => {
        assertValidObjectId(input.prescription!, 'prescription')
        const prescription = await Prescription.findById(input.prescription)
        if (!prescription) throw new AppError('Prescription not found', 404, 'PRESCRIPTION_NOT_FOUND')
        return {
          doc: prescription,
          label: 'prescription',
          duplicateFilter: { prescription: prescription.id, isActive: true },
          fields: { labOrder: undefined as string | undefined, prescription: prescription.id as string | undefined },
        }
      })()

  // This check gives a friendlier, more specific error message in the
  // normal case. On its own, though, it can't stop two requests arriving
  // at the exact same time from both slipping past it — what actually
  // prevents double-billing is the matching partial unique index on
  // models/Invoice.ts, enforced by the database itself. The try/catch
  // below handles the case where that race actually happens.
  const existing = await Invoice.findOne(source.duplicateFilter)
  if (existing) {
    throw new AppError(`This ${source.label} already has an invoice (${existing.invoiceNumber})`, 409, 'INVOICE_ALREADY_EXISTS')
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
      patient: source.doc.patient,
      // Copied from the source document's own `encounter` once, here, at
      // creation — see models/Invoice.ts's comment on why `encounter`
      // exists at all. Nothing in this codebase ever reassigns a LabOrder's
      // or Prescription's `encounter` after creation (both are true
      // immutable parent references, not just by convention), so this
      // can't drift today. If a future change ever adds a way to move
      // either onto a different Encounter, that change must also update
      // every Invoice.encounter pointing at the old one, or this copy will
      // silently go stale.
      encounter: source.doc.encounter,
      labOrder: source.fields.labOrder,
      prescription: source.fields.prescription,
      items,
      subtotal,
      // There's no tax or discount handling yet, so the total is simply
      // equal to the subtotal.
      total: subtotal,
      amountPaid: 0,
      balance: subtotal,
    })
  } catch (err) {
    // This is what closes the race the check above can't: if two requests
    // for the same lab order/prescription both pass the findOne check
    // before either one has written anything, the second create() call
    // collides with the database's unique index and fails with a
    // duplicate-key error. That gets turned into the same clean 409
    // response the earlier check already gives in the normal, non-racing case.
    if (isDuplicateKeyError(err)) {
      throw new AppError(`This ${source.label} already has an invoice`, 409, 'INVOICE_ALREADY_EXISTS')
    }
    throw err
  }
}

// Lists invoices. Admin, Patient, Lab Tech, and Pharmacist all hold
// 'invoice.read' (see types/permissions.ts) — Doctor and Nurse have no
// billing visibility at all. Admin sees every invoice, paginated so this
// doesn't eventually return the entire collection in one response. Patient
// only ever sees their own invoices — a hard rule, not just a default. Lab
// Tech's and Pharmacist's `invoice.read` permission only exists to look up
// one specific order's/prescription's invoice (see getInvoiceForLabOrder/
// getInvoiceForPrescription below) — neither role browses the full ledger,
// so this list function returns nothing for either rather than handing
// back every invoice in the system.
export async function listInvoices(user: AuthedUser, opts: { page?: number; limit?: number } = {}) {
  if (user.role.name === 'PATIENT') {
    const patient = await getPatientForUser(user.id)
    if (!patient) return []
    return Invoice.find({ patient: patient.id }).sort({ createdAt: -1 })
  }

  if (isBrowsingBlocked(user, ['LAB_TECH', 'PHARMACIST'])) return []

  // ADMIN.
  const { skip, limit } = resolvePagination(opts)
  return Invoice.find().populate('patient').sort({ createdAt: -1 }).skip(skip).limit(limit)
}

// Fetches the invoice for a given lab order — there's at most one
// non-voided invoice per order, enforced by a unique index on
// models/Invoice.ts — or null if that order has no invoice yet. Admin and
// Lab Tech can look up any lab order's invoice this way, the same as
// getLabOrderById() in labOrder.service.ts lets them look up any order
// directly by id: it's a direct lookup for an id the caller already has,
// not a browsable list. A patient is different, though — a patient could
// pass in any lab order id at all, so without a check here, they could
// read a stranger's invoice. This enforces the same "only your own
// invoices" rule that getInvoiceById() and listInvoices() already apply
// for a patient.
export async function getInvoiceForLabOrder(labOrderId: string, user: AuthedUser) {
  assertValidObjectId(labOrderId, 'labOrder')
  const invoice = await Invoice.findOne({ labOrder: labOrderId, isActive: true })
  if (!invoice) return null

  if (user.role.name === 'PATIENT') {
    const patient = await getPatientForUser(user.id)
    if (!patient || invoice.patient.toString() !== patient.id) return null
  }

  return invoice
}

// Same as getInvoiceForLabOrder above, mirrored for prescriptions — lets
// Admin/Pharmacist look up one prescription's invoice directly (e.g. to
// disable "Bill this prescription" once it's already billed).
export async function getInvoiceForPrescription(prescriptionId: string, user: AuthedUser) {
  assertValidObjectId(prescriptionId, 'prescription')
  const invoice = await Invoice.findOne({ prescription: prescriptionId, isActive: true })
  if (!invoice) return null

  if (user.role.name === 'PATIENT') {
    const patient = await getPatientForUser(user.id)
    if (!patient || invoice.patient.toString() !== patient.id) return null
  }

  return invoice
}

// Fetches one invoice along with its payment history. For a patient, this
// is locked to their own invoice only, for the same reason listInvoices
// above locks them to their own invoices too — a patient should never be
// able to see someone else's billing.
export async function getInvoiceById(id: string, user: AuthedUser) {
  const invoice = await Invoice.findById(id).populate('patient')
  if (!invoice) throw new AppError('Invoice not found', 404, 'INVOICE_NOT_FOUND')

  if (user.role.name === 'PATIENT') {
    const patient = await getPatientForUser(user.id)
    // `.populate('patient')` above swapped the raw patient id for the full
    // Patient document — asPopulated names that gap for TypeScript so `.id`
    // can be read off it. The `?.` guard matters because populate can
    // genuinely come back null — if the patient this invoice points at was
    // deleted, this avoids throwing an unhandled error and lets the check
    // below turn it into a normal 404 instead.
    const invoicePatientId = asPopulated<{ id: string } | null>(invoice.patient)?.id
    if (!patient || invoicePatientId !== patient.id) {
      // Same invoice, wrong patient. This reports a 404 instead of a 403
      // so a patient can't use this endpoint to figure out which invoice
      // ids exist for other people.
      throw new AppError('Invoice not found', 404, 'INVOICE_NOT_FOUND')
    }
  }

  const payments = await listPaymentsForInvoice(id)
  return { invoice, payments }
}
