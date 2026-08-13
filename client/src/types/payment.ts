export const PAYMENT_METHODS = ['CASH', 'CARD', 'MOBILE_MONEY', 'INSURANCE'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export interface Payment {
  _id: string
  invoice: string
  amount: number
  method: PaymentMethod
  reference?: string
  receivedBy: string
  paidAt: string
}
