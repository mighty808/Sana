import mongoose from 'mongoose'
import { Invoice } from '../models/Invoice.js'
import { Payment, type PaymentMethod } from '../models/Payment.js'
import { AppError, assertValidObjectId } from '../utils/apiResponse.js'
import { roundMoney, MONEY_EPSILON } from '../utils/money.js'

interface CreatePaymentInput {
  invoice: string
  amount: number
  method: PaymentMethod
  reference?: string
}

// Records a payment against an invoice, atomically updating the invoice's
// running amountPaid/balance/status AND creating the Payment document
// itself, all inside one MongoDB transaction. Without the transaction,
// these were two separate writes — if the invoice update succeeded but the
// Payment.create() that followed then failed (a validation edge case, a
// transient DB error, a process crash), the invoice would be permanently
// left showing a payment that doesn't actually exist anywhere as a Payment
// document. Wrapping both in `session.withTransaction` means either both
// writes commit or neither does — MongoDB Atlas (including the free M0
// tier) runs as a replica set, so transactions are available.
//
// Within the transaction, the invoice update itself is still the same
// single atomic pipeline update described before: amountPaid, balance, and
// status are computed and written together as one step, so two payments
// racing on the same invoice can't both independently pass an overpayment
// check against a stale balance — MongoDB serializes the two transactions,
// and whichever commits second sees the first's already-applied amountPaid.
//
// Amounts are rounded to the nearest pesewa (roundMoney) and the
// overpayment/PAID-cutoff comparisons use a small epsilon (MONEY_EPSILON)
// rather than exact equality — JS floating-point arithmetic can leave a
// fully-paid invoice's computed balance at something like 0.00000000003
// instead of exactly 0, which an exact `<= 0` check would treat as "still owing."
export async function recordPayment(input: CreatePaymentInput, receivedBy: string) {
  assertValidObjectId(input.invoice, 'invoice')
  const amount = roundMoney(input.amount)

  const session = await mongoose.startSession()
  try {
    let payment: InstanceType<typeof Payment> | undefined

    await session.withTransaction(async () => {
      const updatedInvoice = await Invoice.findOneAndUpdate(
        {
          _id: input.invoice,
          status: { $ne: 'VOIDED' },
          $expr: {
            $lte: [{ $subtract: [{ $add: ['$amountPaid', amount] }, '$total'] }, MONEY_EPSILON],
          },
        },
        [
          { $set: { amountPaid: { $round: [{ $add: ['$amountPaid', amount] }, 2] } } },
          {
            $set: {
              balance: { $round: [{ $subtract: ['$total', '$amountPaid'] }, 2] },
              status: {
                $cond: [
                  { $lte: [{ $subtract: ['$total', '$amountPaid'] }, MONEY_EPSILON] },
                  'PAID',
                  'PARTIALLY_PAID',
                ],
              },
            },
          },
        ],
        // `updatePipeline: true` is required by Mongoose (not the raw
        // MongoDB driver) whenever the update argument is an array —
        // without it, Mongoose rejects the call outright before it ever
        // reaches MongoDB, assuming an array update was passed by mistake.
        { session, returnDocument: 'after', updatePipeline: true },
      )

      if (!updatedInvoice) {
        // The conditional update matched nothing — figure out why so the
        // error message is actually useful, same disambiguation pattern as
        // labResult.service.ts's createLabResult. Reading with `.session()`
        // keeps this lookup inside the same transaction snapshot.
        const invoice = await Invoice.findById(input.invoice).session(session)
        if (!invoice) throw new AppError('Invoice not found', 404, 'INVOICE_NOT_FOUND')
        if (invoice.status === 'VOIDED') {
          throw new AppError('Cannot record a payment against a voided invoice', 400, 'INVOICE_VOIDED')
        }
        throw new AppError(
          `Payment of ${amount} exceeds the outstanding balance of ${invoice.balance}`,
          400,
          'OVERPAYMENT',
        )
      }

      const created = await Payment.create(
        [{ invoice: input.invoice, amount, method: input.method, reference: input.reference, receivedBy }],
        { session },
      )
      payment = created[0]
    })

    return payment!
  } finally {
    await session.endSession()
  }
}

// Lists payments recorded against one invoice, oldest first.
export async function listPaymentsForInvoice(invoiceId: string) {
  return Payment.find({ invoice: invoiceId }).sort({ paidAt: 1 })
}
