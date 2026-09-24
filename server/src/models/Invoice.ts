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

// A bill generated from exactly one KIND of billable thing on one
// encounter — every lab order on a visit consolidates onto one shared lab
// invoice, every prescription onto one shared prescription invoice (see
// invoice.service.ts's createInvoice, which enforces that "one open
// invoice per encounter per kind" rule and appends to an existing one
// rather than creating a second when it finds one still open). `encounter`
// is kept here too, alongside `labOrders`/`prescriptions`, purely as a
// convenience — the patient timeline and other views can read it directly
// instead of looking it up through the source documents every time.
// `amountPaid`, `balance`, and `status` get kept up to date by
// payment.service.ts's recordPayment() as payments come in — see that
// function's comment for why it updates these in one single database
// operation, rather than loading the invoice, changing it, and saving it
// back. Since this is money, a lost or double-counted update would be a
// real problem, not just a display glitch.
const invoiceSchema = new Schema(
  {
    // Human-readable, sequential id like "INV-2026-00001" (see utils/generateId.ts).
    invoiceNumber: { type: String, required: true, unique: true },
    patient: { type: Schema.Types.ObjectId, ref: 'Patient', required: true },
    encounter: { type: Schema.Types.ObjectId, ref: 'Encounter', required: true },
    // Exactly one of these two is ever non-empty — enforced in
    // invoice.service.ts's createInvoice, not at the Mongoose schema
    // level, the same way this codebase generally keeps cross-field
    // validation in the service layer rather than in the schema itself.
    // Arrays rather than a single ref because every lab order (or
    // prescription) on the same encounter that's still open for billing
    // lands on the same invoice — see createInvoice's "find an open
    // invoice to extend, else create one" logic.
    labOrders: { type: [Schema.Types.ObjectId], ref: 'LabOrder', default: undefined },
    prescriptions: { type: [Schema.Types.ObjectId], ref: 'Prescription', default: undefined },
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
    // True for every status except VOIDED. This exists only so a partial
    // unique index can say "unique among the invoices that are still
    // active" — MongoDB's partial indexes can only filter on simple
    // conditions like equals, exists, or greater/less-than, they can't
    // filter on "not equal to," so there's no way to write that filter
    // directly against `status`. This means any code that sets
    // `status: 'VOIDED'` must also set `isActive: false` in that same
    // update — otherwise indexes relying on it stop actually enforcing
    // anything. (Nothing in this codebase sets this yet — voiding isn't
    // implemented — this is reserved for when it is.)
    isActive: { type: Boolean, default: true },
    // True while status is UNPAID/PARTIALLY_PAID, false once PAID —
    // recordPayment() keeps this in sync as part of the same update that
    // computes status (see payment.service.ts). Same partial-index
    // workaround as isActive above, just for a different condition: "is
    // this invoice still open for new line items" isn't expressible
    // directly as an index filter either. This is what lets a *closed*
    // (paid) invoice fall out of the uniqueness rule below, freeing its
    // encounter up for a fresh invoice of that kind, while a *voided*
    // invoice (isActive: false, once that exists) would too — a PAID
    // invoice is still active, just no longer open for billing, which is
    // why this is a separate field from isActive rather than reusing it.
    isOpenForBilling: { type: Boolean, default: true },
  },
  { timestamps: true },
)

// Powers "this patient's billing history" and admin's "outstanding
// invoices" view (status != PAID).
invoiceSchema.index({ patient: 1, createdAt: -1 })
invoiceSchema.index({ status: 1 })
// Enforces "at most one OPEN lab invoice per encounter" at the database
// level, not just through invoice.service.ts's own check before creating
// one (which on its own has a gap: two requests arriving at almost the
// same moment could both pass that check before either has written
// anything, and both succeed). Scoped to `encounter` rather than to a
// specific lab order — that's the whole point of consolidation: every
// still-open lab invoice on a visit is the same one. Once an invoice's
// `isOpenForBilling` flips to false (paid), it drops out of this index's
// filter, so a later lab order on the same encounter can get a fresh
// invoice instead of being blocked from ever billing again.
//
// `labOrders: { $exists: true }` in the filter matters now that
// `labOrders` is optional (a prescription-billing invoice never sets it):
// without that clause, every prescription invoice would also match this
// partial index with `labOrders` absent, and MongoDB would only ever
// allow ONE such document system-wide.
//
// Both this index and the prescriptions one below share the same key
// pattern (`{encounter: 1}`), just with different partialFilterExpressions
// — MongoDB auto-names an index from its key pattern alone when no name is
// given, so without explicit, distinct `name`s here, both would try to
// register as "encounter_1" and the second creation would be rejected
// outright (confirmed against the real database, not just reasoned about —
// MongoServerError: IndexKeySpecsConflict).
invoiceSchema.index(
  { encounter: 1 },
  {
    name: 'encounter_1_open_lab_invoice',
    unique: true,
    partialFilterExpression: { isOpenForBilling: true, labOrders: { $exists: true } },
  },
)
// Same rule, mirrored for prescriptions — at most one open prescription
// invoice per encounter.
invoiceSchema.index(
  { encounter: 1 },
  {
    name: 'encounter_1_open_prescription_invoice',
    unique: true,
    partialFilterExpression: { isOpenForBilling: true, prescriptions: { $exists: true } },
  },
)

export type InvoiceAttrs = InferSchemaType<typeof invoiceSchema>
export type InvoiceDoc = HydratedDocument<InvoiceAttrs>
export const Invoice = model<InvoiceAttrs>('Invoice', invoiceSchema)
