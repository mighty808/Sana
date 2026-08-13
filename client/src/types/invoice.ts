import type { Patient } from './patient'
import type { Payment } from './payment'

export const INVOICE_STATUSES = ['UNPAID', 'PARTIALLY_PAID', 'PAID', 'VOIDED'] as const
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number]

export interface InvoiceItem {
  description: string
  qty: number
  unitPrice: number
  amount: number
}

// `patient` is populated on Admin's list (listInvoices) and on
// getInvoiceById for every role, but NOT on a Patient's own list (no
// .populate() there — see invoice.service.ts — since it's implicitly
// their own). Matches the same populated-or-string pattern as Appointment.
export interface Invoice {
  _id: string
  invoiceNumber: string
  patient: Patient | string
  encounter: string
  items: InvoiceItem[]
  subtotal: number
  total: number
  amountPaid: number
  balance: number
  status: InvoiceStatus
  isActive: boolean
  createdAt: string
}

export interface InvoiceDetail {
  invoice: Invoice
  payments: Payment[]
}
