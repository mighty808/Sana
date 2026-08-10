import { Invoice } from '../models/Invoice.js'
import { Payment, type PaymentMethod } from '../models/Payment.js'
import { AppError, assertValidObjectId } from '../utils/apiResponse.js'

interface CreatePaymentInput {
  invoice: string
  amount: number
  method: PaymentMethod
  reference?: string
}

// Records a payment against an invoice, atomically updating the invoice's
// running amountPaid/balance/status in the SAME database operation.
//
// This uses a MongoDB aggregation-PIPELINE update (the update argument is
// an array of stages, not a plain object) rather than the simpler
// "atomic $inc, then a separate $set for the derived fields" two-step
// pattern used for lab order status roll-up in Phase 5. That two-step
// approach left a narrow, self-correcting race window between the two
// writes, which was an accepted tradeoff for a lab order's status field.
// Money is different: amountPaid/balance must never be inconsistent with
// each other even transiently, and two payments racing on the same invoice
// (e.g. a doctor's assistant double-clicking "record payment") must not
// both be able to independently pass an overpayment check against a
// stale balance. A single pipeline update computes the new amountPaid,
// balance, AND status together as one atomic step, so there's no gap for
// a second concurrent write to land in.
//
// The query's `$expr` condition ({amountPaid + this payment} <= total)
// means the update only APPLIES if this payment wouldn't overpay the
// invoice — MongoDB evaluates the filter and applies the update as one
// atomic unit, so if two payments race, whichever is processed second sees
// the first one's already-applied amountPaid and gets correctly rejected
// if it would now overpay, rather than both succeeding.
export async function recordPayment(input: CreatePaymentInput, receivedBy: string) {
  assertValidObjectId(input.invoice, 'invoice')

  const updatedInvoice = await Invoice.findOneAndUpdate(
    {
      _id: input.invoice,
      status: { $ne: 'VOIDED' },
      $expr: { $lte: [{ $add: ['$amountPaid', input.amount] }, '$total'] },
    },
    [
      { $set: { amountPaid: { $add: ['$amountPaid', input.amount] } } },
      {
        $set: {
          balance: { $subtract: ['$total', '$amountPaid'] },
          status: {
            $cond: [{ $lte: [{ $subtract: ['$total', '$amountPaid'] }, 0] }, 'PAID', 'PARTIALLY_PAID'],
          },
        },
      },
    ],
    // `updatePipeline: true` is required by Mongoose (not the raw MongoDB
    // driver) whenever the update argument is an array — without it,
    // Mongoose rejects the call outright before it ever reaches MongoDB,
    // assuming an array update was passed by mistake.
    { returnDocument: 'after', updatePipeline: true },
  )

  if (!updatedInvoice) {
    // The conditional update matched nothing — figure out why so the error
    // message is actually useful, same disambiguation pattern as
    // labResult.service.ts's createLabResult.
    const invoice = await Invoice.findById(input.invoice)
    if (!invoice) throw new AppError('Invoice not found', 404, 'INVOICE_NOT_FOUND')
    if (invoice.status === 'VOIDED') {
      throw new AppError('Cannot record a payment against a voided invoice', 400, 'INVOICE_VOIDED')
    }
    throw new AppError(
      `Payment of ${input.amount} exceeds the outstanding balance of ${invoice.balance}`,
      400,
      'OVERPAYMENT',
    )
  }

  return Payment.create({
    invoice: input.invoice,
    amount: input.amount,
    method: input.method,
    reference: input.reference,
    receivedBy,
  })
}

// Lists payments recorded against one invoice, oldest first.
export async function listPaymentsForInvoice(invoiceId: string) {
  return Payment.find({ invoice: invoiceId }).sort({ paidAt: 1 })
}
