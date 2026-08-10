import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose'

// Payment methods reflect how patients actually pay in a Ghanaian hospital
// setting — mobile money (MoMo) is at least as common as card payment, so
// it's included alongside the more universal cash/card/insurance options.
export const PAYMENT_METHODS = ['CASH', 'CARD', 'MOBILE_MONEY', 'INSURANCE'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

// One payment recorded against an invoice. An invoice can have several of
// these (partial payments over time), which is why payments live in their
// own collection rather than as embedded fields on Invoice — same reasoning
// as VitalSign/LabResult being separate from their parent Encounter/LabOrder.
const paymentSchema = new Schema(
  {
    invoice: { type: Schema.Types.ObjectId, ref: 'Invoice', required: true },
    amount: { type: Number, required: true, min: 0.01 },
    method: { type: String, enum: PAYMENT_METHODS, required: true },
    // Free-text external reference — a MoMo transaction id, a card
    // terminal's receipt number, an insurance claim number, etc. Optional
    // since a cash payment often has nothing to reference.
    reference: { type: String, trim: true },
    // Admin in this MVP (no separate Billing Officer role — see blueprint
    // section 1.3, same reasoning as LabResult.performedBy).
    receivedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    paidAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true },
)

// Powers "all payments against this invoice" (shown alongside the invoice).
paymentSchema.index({ invoice: 1, paidAt: 1 })

export type PaymentAttrs = InferSchemaType<typeof paymentSchema>
export type PaymentDoc = HydratedDocument<PaymentAttrs>
export const Payment = model<PaymentAttrs>('Payment', paymentSchema)
