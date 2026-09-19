import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose'

export const INVOICE_STATUSES = ['UNPAID', 'PARTIALLY_PAID', 'PAID', 'VOIDED'] as const
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number]

// One line item on an invoice, e.g. { description: 'Consultation fee', qty: 1,
// unitPrice: 150, amount: 150 }. `amount` is always computed server-side as
// qty * unitPrice (see invoice.service.ts) rather than trusted from the
// client — otherwise a caller could submit a mismatched amount and quietly
// under- or over-charge a patient.
const invoiceItemSchema = new Schema(
  {
    description: { type: String, required: true, trim: true },
    qty: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    amount: { type: Number, required: true, min: 0 },
  },
  { _id: false },
)

// A bill generated from exactly one billable thing — a lab order or a
// prescription — one invoice per order/prescription, with one line item
// per test/medication on it (see invoice.service.ts's createInvoice,
// which enforces that "exactly one" rule). `encounter` is kept here too,
// alongside `labOrder`/`prescription`, purely as a convenience — the
// patient timeline and other views can read it directly instead of
// looking it up through the source document every time. `amountPaid`,
// `balance`, and `status` get kept up to date by payment.service.ts's
// recordPayment() as payments come in — see that function's comment for
// why it updates these in one single database operation, rather than
// loading the invoice, changing it, and saving it back. Since this is
// money, a lost or double-counted update would be a real problem, not
// just a display glitch.
const invoiceSchema = new Schema(
  {
    // Human-readable, sequential id like "INV-2026-00001" (see utils/generateId.ts).
    invoiceNumber: { type: String, required: true, unique: true },
    patient: { type: Schema.Types.ObjectId, ref: 'Patient', required: true },
    encounter: { type: Schema.Types.ObjectId, ref: 'Encounter', required: true },
    // Exactly one of these two is ever set — enforced in
    // invoice.service.ts's createInvoice (and schemas/invoice.ts's zod
    // schema on the way in), not at the Mongoose schema level, the same
    // way this codebase generally keeps cross-field validation in the
    // service layer rather than in the schema itself.
    labOrder: { type: Schema.Types.ObjectId, ref: 'LabOrder' },
    prescription: { type: Schema.Types.ObjectId, ref: 'Prescription' },
    items: { type: [invoiceItemSchema], required: true },
    subtotal: { type: Number, required: true, min: 0 },
    // This is its own field, separate from `subtotal`, so that tax or
    // discount logic has somewhere to plug in later without needing to
    // change the schema. For now, since there's no tax or discount logic
    // yet, `total` always ends up equal to `subtotal`.
    total: { type: Number, required: true, min: 0 },
    amountPaid: { type: Number, required: true, default: 0, min: 0 },
    balance: { type: Number, required: true },
    status: { type: String, enum: INVOICE_STATUSES, default: 'UNPAID' },
    // True for every status except VOIDED. This exists only so the
    // partial unique index below can say "unique among the invoices that
    // are still active." MongoDB's partial indexes can only filter on
    // simple conditions like equals, exists, or greater/less-than — they
    // can't filter on "not equal to," so there's no way to write that
    // filter directly against `status`. This means any code that sets
    // `status: 'VOIDED'` must also set `isActive: false` in that same
    // update — otherwise the index below stops actually enforcing the rule.
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
)

// Powers "this patient's billing history" and admin's "outstanding
// invoices" view (status != PAID).
invoiceSchema.index({ patient: 1, createdAt: -1 })
invoiceSchema.index({ status: 1 })
// This enforces "at most one non-voided invoice per lab order" at the
// database level, not just through invoice.service.ts's own check before
// creating one (which on its own has a gap: two requests arriving at
// almost the same moment could both pass that check before either has
// written anything, and both succeed). This partial unique index — unique
// on `labOrder`, but only counting documents where `isActive` is true —
// is what makes the rule conditional instead of absolute: a voided
// invoice falls outside the index's filter, so its lab order can still
// get a replacement invoice afterward. It's scoped to `labOrder` rather
// than `encounter` so that an encounter with several lab orders can bill
// each one separately, instead of forcing every test across a whole
// visit onto one invoice.
//
// `labOrder: { $exists: true }` in the filter matters now that `labOrder`
// is optional (a prescription-billing invoice never sets it): without that
// clause, every prescription invoice would also match this partial index
// with `labOrder` absent, and MongoDB would only ever allow ONE such
// document — every prescription invoice after the first would collide on
// a uniqueness rule that was never meant to apply to it at all.
invoiceSchema.index(
  { labOrder: 1 },
  { unique: true, partialFilterExpression: { isActive: true, labOrder: { $exists: true } } },
)
// Same rule, mirrored for prescriptions — at most one active invoice per prescription.
invoiceSchema.index(
  { prescription: 1 },
  { unique: true, partialFilterExpression: { isActive: true, prescription: { $exists: true } } },
)

export type InvoiceAttrs = InferSchemaType<typeof invoiceSchema>
export type InvoiceDoc = HydratedDocument<InvoiceAttrs>
export const Invoice = model<InvoiceAttrs>('Invoice', invoiceSchema)
