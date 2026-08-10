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

// A bill generated from a completed encounter. `amountPaid`/`balance`/
// `status` are running totals kept in sync by payment.service.ts's
// recordPayment() as payments come in — see that function's comment for why
// it uses a single atomic pipeline update rather than a load/mutate/save
// cycle (this is money; a lost or double-counted update is a real problem,
// not just a display glitch).
const invoiceSchema = new Schema(
  {
    // Human-readable, sequential id like "INV-2026-00001" (see utils/generateId.ts).
    invoiceNumber: { type: String, required: true, unique: true },
    patient: { type: Schema.Types.ObjectId, ref: 'Patient', required: true },
    encounter: { type: Schema.Types.ObjectId, ref: 'Encounter', required: true },
    items: { type: [invoiceItemSchema], required: true },
    subtotal: { type: Number, required: true, min: 0 },
    // Kept as its own field (rather than always just reading `subtotal`)
    // because the blueprint's schema lists both — this MVP has no
    // tax/discount logic yet, so `total` always equals `subtotal` today,
    // but the field exists so that logic has somewhere to plug in later
    // without a schema migration.
    total: { type: Number, required: true, min: 0 },
    amountPaid: { type: Number, required: true, default: 0, min: 0 },
    balance: { type: Number, required: true },
    status: { type: String, enum: INVOICE_STATUSES, default: 'UNPAID' },
    // True for every status except VOIDED. Exists purely so the partial
    // unique index below can express "unique among non-voided invoices" —
    // MongoDB's partialFilterExpression only supports simple equality-style
    // conditions ($eq, $exists, $gt/$gte/$lt/$lte), not $ne or $in, so
    // there's no way to write the filter directly against `status`. Any
    // future code that sets `status: 'VOIDED'` MUST also set `isActive:
    // false` in the same update, or this index stops enforcing the invariant.
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
)

// Powers "this patient's billing history" and admin's "outstanding
// invoices" view (status != PAID).
invoiceSchema.index({ patient: 1, createdAt: -1 })
invoiceSchema.index({ status: 1 })
// Enforces "at most one non-VOIDED invoice per encounter" AT THE DATABASE
// LEVEL, not just via invoice.service.ts's findOne-then-create check (which
// on its own has a race: two near-simultaneous requests can both pass that
// check before either has written, both succeeding). A PARTIAL unique
// index — unique on `encounter`, but only among documents where
// `isActive: true` — is what makes this a conditional rule instead of a
// blanket one: a VOIDED invoice (isActive: false) falls outside the
// index's filter, so its encounter CAN still get a replacement invoice.
invoiceSchema.index({ encounter: 1 }, { unique: true, partialFilterExpression: { isActive: true } })

export type InvoiceAttrs = InferSchemaType<typeof invoiceSchema>
export type InvoiceDoc = HydratedDocument<InvoiceAttrs>
export const Invoice = model<InvoiceAttrs>('Invoice', invoiceSchema)
