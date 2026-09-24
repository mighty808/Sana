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
// or just the id string" pattern as Appointment. `labOrders`/`prescriptions`
// are arrays, not a single id, because billing consolidates: every lab
// order on an encounter that's still open for billing lands on the same
// invoice, same for prescriptions (see invoice.service.ts's createInvoice)
// — exactly one of the two is ever non-empty on a given invoice, never
// both. `encounter` is kept here too as a convenience field.
export interface Invoice {
  _id: string
  invoiceNumber: string
  patient: Patient | string
  encounter: string
  labOrders?: string[]
  prescriptions?: string[]
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

// One row per patient — see invoice.service.ts's
// listInvoiceSummariesByPatient. This is what the Admin's Invoices page
// actually lists now, instead of a flat Invoice[]; only a slice of Patient
// is included since that's all the summary aggregation projects.
export interface PatientInvoiceSummary {
  patient: Pick<Patient, '_id' | 'firstName' | 'lastName' | 'patientNumber'>
  invoiceCount: number
  totalOwed: number
}
