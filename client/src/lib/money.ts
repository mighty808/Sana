// Formats an amount as Ghana Cedis. This matches how the backend itself
// handles money (server/src/utils/money.ts rounds to the nearest pesewa,
// meaning 2 decimal places) and fits the Ghanaian context used elsewhere in
// the app, where Payment.method includes MOBILE_MONEY alongside cash, card,
// and insurance.
export function formatMoney(amount: number): string {
  return `GH₵${amount.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// Sana's standard flat fee per lab test. This is applied automatically
// whenever a lab order's tests get turned into invoice line items. Both the
// Admin's invoice-creation flow (features/invoices/InvoicesPage.tsx) and the
// Lab Tech's "Bill this order" action (features/labOrders/LabOrdersPage.tsx)
// use this same constant, so the fee always stays the same no matter which
// screen created the invoice.
export const STANDARD_LAB_TEST_FEE = 100

// Same flat-fee approach as lab tests — there's no drug catalog/pricing
// yet (out of scope for this pass, see models/Prescription.ts), so each
// medication on a prescription bills at this same flat rate.
export const STANDARD_MEDICATION_FEE = 50
