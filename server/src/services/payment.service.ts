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

// Records a payment against an invoice. This updates the invoice's
// amountPaid, balance, and status, and creates the Payment document, all
// inside one MongoDB transaction. Without a transaction, these would be
// two separate writes — and if the invoice update succeeded but creating
// the Payment document afterward then failed for any reason, the invoice
// would be permanently left showing a payment that doesn't actually exist
// as a real Payment record anywhere. Wrapping both in
// `session.withTransaction` means either both writes go through, or
// neither does.
//
// Inside the transaction, the invoice update is still one single
// database operation that computes and writes amountPaid, balance, and
// status all together. That matters if two payments come in for the same
// invoice at almost the same time: MongoDB processes the two transactions
// one after the other, not at the same time, so the second payment to
// commit always sees the first payment's amount already applied — neither
// one can check the balance against stale, out-of-date numbers.
//
// Amounts are rounded to the nearest pesewa, and the checks for
// overpayment or "has this reached PAID" use a small tolerance
// (MONEY_EPSILON) instead of comparing for an exact match. That's because
// floating-point math can leave a fully-paid invoice with a computed
// balance like 0.00000000003 instead of a clean 0 — an exact `<= 0` check
// would wrongly treat that as still owing money.
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
        // Mongoose requires `updatePipeline: true` whenever the update
        // argument is an array like this one, or it rejects the call
        // before it even reaches MongoDB, assuming the array was passed
        // in by mistake.
        { session, returnDocument: 'after', updatePipeline: true },
      )

      if (!updatedInvoice) {
        // The update above matched nothing, so figure out why, to give a
        // useful error message — the same approach
        // labResult.service.ts's createLabResult uses. Reading with
        // `.session()` keeps this lookup inside the same transaction, so
        // it sees a consistent view of the data.
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
