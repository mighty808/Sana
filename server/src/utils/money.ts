// Rounds a monetary value to 2 decimal places, the smallest unit Sana's
// invoicing deals in (cedis and pesewas). This is used everywhere a money
// value gets calculated, such as item amount = qty * unitPrice, a subtotal,
// or a payment amount, instead of storing or comparing the raw result of the
// calculation.
//
// Computers can't store most decimal fractions like money amounts exactly
// (famously, 0.1 + 0.2 doesn't equal 0.3 in JavaScript). Without rounding
// after each calculation, splitting an invoice total across a few payments
// could leave `amountPaid` off from `total` by a tiny fraction of a pesewa.
// That tiny difference would be enough to make a simple "does this exactly
// equal that?" check for "has this been paid in full?" give the wrong answer
// forever. Rounding to 2 decimal places after every calculation step keeps
// values landing on the same number a human would expect to see.
export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

// A small tolerance used when comparing money values that have already been
// through roundMoney(), to check whether two amounts are "close enough" to
// count as equal or as zero, rather than checking for an exact match. This
// guards against tiny leftover rounding noise that can still show up when
// MongoDB's aggregation pipeline (not JavaScript) does the arithmetic on the
// database side instead (see payment.service.ts's recordPayment). Half a
// pesewa is far smaller than any real currency's smallest unit, so this
// tolerance can never hide an actual outstanding balance.
export const MONEY_EPSILON = 0.005
