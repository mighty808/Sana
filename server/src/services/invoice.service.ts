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
import { mayReadEncounter } from './encounter.service.js'

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

// Bills one lab order or one prescription. `patient` and `encounter` are
// looked up from that source document, not taken from whatever the caller
// sends, for the same reason labOrder.service.ts's createLabOrder does the
// same thing: a bill always belongs to whichever patient and encounter the
// thing it's billing actually belongs to.
//
// The caller still only ever names one specific order/prescription — the
// consolidation below (everything of the same kind on the same encounter
// landing on one shared invoice) is a server-side decision, not something
// the "Bill this order"/"Bill this prescription" buttons need to know
// about. If an invoice for this encounter and this kind is still open
// (UNPAID/PARTIALLY_PAID), this order/prescription's items are appended to
// it; otherwise a fresh invoice is created, exactly as before.
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

  // Everything that differs between the two billable kinds — the friendly
  // name used in error messages, and which of Invoice's two array fields
  // this source belongs on — is derived once here, at the one point that
  // already has to branch on which kind was given. Nothing below this
  // branches on labOrder-vs-prescription again.
  const source = input.labOrder
    ? await (async () => {
        assertValidObjectId(input.labOrder!, 'labOrder')
        const labOrder = await LabOrder.findById(input.labOrder)
        if (!labOrder) throw new AppError('Lab order not found', 404, 'LAB_ORDER_NOT_FOUND')
        return { doc: labOrder, label: 'lab order', arrayField: 'labOrders' as const, sourceId: labOrder.id as string }
      })()
    : await (async () => {
        assertValidObjectId(input.prescription!, 'prescription')
        const prescription = await Prescription.findById(input.prescription)
        if (!prescription) throw new AppError('Prescription not found', 404, 'PRESCRIPTION_NOT_FOUND')
        return {
          doc: prescription,
          label: 'prescription',
          arrayField: 'prescriptions' as const,
          sourceId: prescription.id as string,
        }
      })()

  // This exact order/prescription can't appear on more than one invoice,
  // whether or not the invoice it's already on is still open — otherwise
  // the same medication could quietly get billed twice.
  const alreadyBilled = await Invoice.findOne({ encounter: source.doc.encounter, [source.arrayField]: source.sourceId })
  if (alreadyBilled) {
    throw new AppError(
      `This ${source.label} already has an invoice (${alreadyBilled.invoiceNumber})`,
      409,
      'INVOICE_ALREADY_EXISTS',
    )
  }

  const items = input.items.map((item) => ({
    ...item,
    amount: roundMoney(item.qty * item.unitPrice),
  }))
  const itemsTotal = roundMoney(items.reduce((sum, item) => sum + item.amount, 0))

  // Is there already an invoice for this encounter, of this kind, still
  // open for new line items? If so, this billing action extends it rather
  // than starting a second invoice for the same visit.
  const openInvoice = await Invoice.findOne({
    encounter: source.doc.encounter,
    isOpenForBilling: true,
    [source.arrayField]: { $exists: true },
  })

  if (openInvoice) {
    // `isOpenForBilling: true` repeated in the filter (not just relied on
    // from the findOne above) so this can't append to an invoice that got
    // paid in the narrow window between that check and this update.
    const updated = await Invoice.findOneAndUpdate(
      { _id: openInvoice._id, isOpenForBilling: true },
      {
        $push: { [source.arrayField]: source.sourceId, items: { $each: items } },
        $inc: { subtotal: itemsTotal, total: itemsTotal, balance: itemsTotal },
      },
      { returnDocument: 'after' },
    )
    if (!updated) {
      // The invoice was paid in that narrow window — same fail-safe spirit
      // as the duplicate-key catch below: tell the caller to retry rather
      // than silently doing nothing. Retrying will correctly fall into the
      // "create a fresh invoice" branch below, since this one is now closed.
      throw new AppError(`This ${source.label}'s invoice was just paid — try billing it again`, 409, 'INVOICE_ALREADY_EXISTS')
    }
    return updated
  }

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
      [source.arrayField]: [source.sourceId],
      items,
      subtotal: itemsTotal,
      // There's no tax or discount handling yet, so the total is simply
      // equal to the subtotal.
      total: itemsTotal,
      amountPaid: 0,
      balance: itemsTotal,
    })
  } catch (err) {
    // This is what closes the race the check above can't: if two requests
    // for two different orders/prescriptions on the same encounter both
    // find no open invoice yet and both try to create the first one, the
    // second create() call collides with the database's unique index and
    // fails with a duplicate-key error. That gets turned into the same
    // clean 409 response the earlier checks already give in the normal,
    // non-racing case — retrying it will correctly append to the
    // now-existing invoice instead.
    if (isDuplicateKeyError(err)) {
      throw new AppError(`This ${source.label} already has an invoice`, 409, 'INVOICE_ALREADY_EXISTS')
    }
    throw err
  }
}

// Lists invoices. Admin, Patient, Lab Tech, Pharmacist, and Doctor all hold
// 'invoice.read' (see types/permissions.ts) — Nurse has no billing
// visibility at all. Admin sees every invoice, paginated so this doesn't
// eventually return the entire collection in one response. Patient only
// ever sees their own invoices — a hard rule, not just a default. Lab
// Tech's, Pharmacist's, and Doctor's `invoice.read` permission only exists
// to look up one specific order's/prescription's invoice (see
// getInvoiceForLabOrder/getInvoiceForPrescription below, which is what the
// "Bill this order" button actually calls) — none of the three browses the
// full ledger, so this list function returns nothing for any of them
// rather than handing back every patient's invoice in the system.
export async function listInvoices(user: AuthedUser, opts: { page?: number; limit?: number } = {}) {
  if (user.role.name === 'PATIENT') {
    const patient = await getPatientForUser(user.id)
    if (!patient) return []
    return Invoice.find({ patient: patient.id }).sort({ createdAt: -1 })
  }

  if (isBrowsingBlocked(user, ['LAB_TECH', 'PHARMACIST', 'DOCTOR'])) return []

  // ADMIN.
  const { skip, limit } = resolvePagination(opts)
  return Invoice.find().populate('patient').sort({ createdAt: -1 }).skip(skip).limit(limit)
}

// One row per patient — invoice count and total outstanding balance —
// instead of a flat chronological list. This is what the Admin's Invoices
// page actually browses by now: a patient with several invoices (a lab
// order's plus one or more prescriptions', all on the same encounter, as
// with Kofi Patient) used to show as several same-named rows in a row;
// this collapses that into one row per patient, and the page links each
// one through to that patient's own Invoices tab (which still lists every
// individual invoice) rather than trying to show them here too.
//
// An aggregation rather than "list every patient, then N+1 queries for
// each one's invoices" — same reasoning as sumOutstandingBalance above.
// Admin-only; enforced at the route level via the 'user.manage' permission
// (the same permission the client already checks to decide whether it's
// rendering the admin view of this page at all), not re-checked here.
export async function listInvoiceSummariesByPatient(opts: { page?: number; limit?: number } = {}) {
  const { skip, limit } = resolvePagination(opts)
  return Invoice.aggregate([
    {
      $group: {
        _id: '$patient',
        invoiceCount: { $sum: 1 },
        totalOwed: { $sum: '$balance' },
        // Not returned to the client — only used to order patients by
        // whoever has the most recent billing activity first, the same
        // "newest first" feel the old flat list had.
        lastActivity: { $max: '$createdAt' },
      },
    },
    { $sort: { lastActivity: -1 } },
    { $skip: skip },
    { $limit: limit },
    // $lookup rather than .populate() — this is a plain aggregate(), which
    // doesn't go through Mongoose's document layer, so there's nothing for
    // .populate() to hook into.
    { $lookup: { from: 'patients', localField: '_id', foreignField: '_id', as: 'patient' } },
    { $unwind: '$patient' },
    {
      $project: {
        _id: 0,
        patient: {
          _id: '$patient._id',
          firstName: '$patient.firstName',
          lastName: '$patient.lastName',
          patientNumber: '$patient.patientNumber',
        },
        invoiceCount: 1,
        totalOwed: 1,
      },
    },
  ])
}

// Fetches the invoice covering a given lab order — or null if that order
// hasn't been billed yet. Since billing now consolidates every lab order
// on an encounter onto one shared invoice (see createInvoice), this may be
// the same invoice another lab order on the same encounter is also on;
// `labOrders: labOrderId` matches a scalar against the array the same way
// a singular-field query would, so this still answers exactly "has *this*
// order been billed," independent of which invoice it landed in — which
// is all the "Bill this order" button's `!invoice` check actually needs.
// Admin, Lab Tech, and Pharmacist can look up any lab order's invoice this
// way, the same as getLabOrderById() in labOrder.service.ts lets them look
// up any order directly by id: it's a direct lookup for an id the caller
// already has, not a browsable list. A patient is different, though — a
// patient could pass in any lab order id at all, so without a check here,
// they could read a stranger's invoice. This enforces the same "only your
// own invoices" rule that getInvoiceById() and listInvoices() already
// apply for a patient. A doctor is scoped the same way getLabOrderById()
// itself scopes them — via mayReadEncounter — since, unlike Lab
// Tech/Pharmacist (who have no "own patients" concept, just the whole
// queue), a doctor is restricted to their own patients everywhere else in
// the app; without this, a doctor could pass in an arbitrary lab order id
// and learn another doctor's patient's billing amount/status.
export async function getInvoiceForLabOrder(labOrderId: string, user: AuthedUser) {
  assertValidObjectId(labOrderId, 'labOrder')
  const invoice = await Invoice.findOne({ labOrders: labOrderId, isActive: true })
  if (!invoice) return null

  if (user.role.name === 'PATIENT') {
    const patient = await getPatientForUser(user.id)
    if (!patient || invoice.patient.toString() !== patient.id) return null
  }

  if (!(await mayReadEncounter(invoice.encounter.toString(), user))) return null

  return invoice
}

// Same as getInvoiceForLabOrder above, mirrored for prescriptions — lets
// Admin/Pharmacist look up one prescription's invoice directly (e.g. to
// disable "Bill this prescription" once it's already billed), and scopes
// a doctor to their own patients the same way.
export async function getInvoiceForPrescription(prescriptionId: string, user: AuthedUser) {
  assertValidObjectId(prescriptionId, 'prescription')
  const invoice = await Invoice.findOne({ prescriptions: prescriptionId, isActive: true })
  if (!invoice) return null

  if (user.role.name === 'PATIENT') {
    const patient = await getPatientForUser(user.id)
    if (!patient || invoice.patient.toString() !== patient.id) return null
  }

  if (!(await mayReadEncounter(invoice.encounter.toString(), user))) return null

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
