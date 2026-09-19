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

// `patient` is filled in on the Admin's list (listInvoices) and on
// getInvoiceById for every role, but not on a Patient's own list — there's
// no .populate() call there (see invoice.service.ts), since it's obviously
// their own record anyway. This follows the same "either the full object
// or just the id string" pattern as Appointment. There's one invoice per
// `labOrder` or `prescription` (exactly one of the two is ever set, never
// both — see invoice.service.ts's createInvoice), not per `encounter` — an
// encounter with several lab orders/prescriptions gets billed separately
// for each one. `encounter` is kept here too as a convenience field, but
// it isn't what invoices are actually organized by.
export interface Invoice {
  _id: string
  invoiceNumber: string
  patient: Patient | string
  encounter: string
  labOrder?: string
  prescription?: string
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
