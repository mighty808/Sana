// Rounds a monetary value to 2 decimal places (the smallest unit Sana's
// invoicing deals in — cedis and pesewas). Used everywhere a money value is
// computed (item amount = qty * unitPrice, subtotal, a payment amount)
// rather than stored/compared as a raw floating-point result.
//
// JS numbers are IEEE-754 doubles, which can't represent most decimal
// fractions exactly (0.1 + 0.2 !== 0.3). Without rounding at each
// computation boundary, splitting an invoice total across a few payments
// can leave `amountPaid` a fraction of a pesewa off from `total` — enough
// for an exact-equality "has this been paid in full?" check to get the
// wrong answer forever. Rounding to 2dp after every arithmetic step keeps
// values landing on the same representable number a human would expect.
export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

// A small tolerance for "close enough to zero/equal" comparisons on money
// values that have already been through roundMoney() — guards against the
// rare residual floating-point noise that can still occur when MongoDB's
// aggregation pipeline (not JS) does the arithmetic server-side (see
// payment.service.ts's recordPayment). Half a pesewa is well below any
// real currency's smallest unit, so it can never mask an actual outstanding balance.
export const MONEY_EPSILON = 0.005
