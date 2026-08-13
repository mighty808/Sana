// Ghana Cedi formatting — matches the backend's own money handling
// (server/src/utils/money.ts rounds to the nearest pesewa, i.e. 2 decimal
// places) and the Ghanaian context already established elsewhere
// (Payment.method includes MOBILE_MONEY alongside cash/card/insurance).
export function formatMoney(amount: number): string {
  return `GH₵${amount.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
