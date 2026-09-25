import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type ApiSuccess } from '@/lib/api'
import type { Invoice, InvoiceDetail, PatientInvoiceSummary } from '@/types/invoice'

// This matches the shape expected by server/src/schemas/invoice.ts's createInvoiceSchema.
// We don't send an `amount` for each item. The backend always works it out itself
// as qty * unitPrice, so there's no need to calculate it here.
export interface InvoiceItemInput {
  description: string
  qty: number
  unitPrice: number
}

// Exactly one of `labOrder`/`prescription` must be given — matches
// schemas/invoice.ts's createInvoiceSchema refine on the server.
export interface InvoiceInput {
  labOrder?: string
  prescription?: string
  items: InvoiceItemInput[]
}

// GET /invoices?page=&limit= — unlike the patients and appointments endpoints,
// this one just returns a plain array of invoices, with no total count or page
// count included (see invoice.service.ts's listInvoices, which always returns a
// plain array). Because there's no total count to check against, the page
// component instead figures out it has reached the last page whenever fewer
// rows come back than the requested `limit`.
export function useInvoices(page: number, limit: number) {
  return useQuery({
    queryKey: ['invoices', { page, limit }],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<Invoice[]>>('/invoices', { params: { page, limit } })
      return res.data.data
    },
    placeholderData: (prev) => prev,
  })
}

// GET /invoices/patient-summary?page=&limit= — Admin-only. One row per
// patient (invoice count, total owed) instead of a flat invoice list; this
// is what InvoicesPage.tsx's admin view actually renders now. Same
// "no total/page count, so figure out the last page from a short response"
// pagination shape as useInvoices above.
export function usePatientInvoiceSummaries(page: number, limit: number) {
  return useQuery({
    queryKey: ['invoices', 'patient-summary', { page, limit }],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<PatientInvoiceSummary[]>>('/invoices/patient-summary', {
        params: { page, limit },
      })
      return res.data.data
    },
    placeholderData: (prev) => prev,
  })
}

// GET /invoices?labOrder= — returns the invoice for that lab order, or null if
// one hasn't been created yet. This is used in the Lab Order detail dialog
// (features/labOrders/LabOrdersPage.tsx) both to show a payment-status badge
// and to decide whether the "Bill this order" button should be shown.
export function useInvoiceForLabOrder(labOrderId: string | undefined) {
  return useQuery({
    queryKey: ['invoices', 'labOrder', labOrderId],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<Invoice | null>>('/invoices', { params: { labOrder: labOrderId } })
      return res.data.data
    },
    enabled: Boolean(labOrderId),
  })
}

// GET /invoices?prescription= — same idea as useInvoiceForLabOrder above,
// for the Prescriptions queue's "Bill this prescription" button.
export function useInvoiceForPrescription(prescriptionId: string | undefined) {
  return useQuery({
    queryKey: ['invoices', 'prescription', prescriptionId],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<Invoice | null>>('/invoices', { params: { prescription: prescriptionId } })
      return res.data.data
    },
    enabled: Boolean(prescriptionId),
  })
}

export function useInvoice(id: string | undefined) {
  return useQuery({
    queryKey: ['invoices', 'detail', id],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<InvoiceDetail>>(`/invoices/${id}`)
      return res.data.data
    },
    enabled: Boolean(id),
  })
}

export function useCreateInvoice() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: InvoiceInput) => {
      const res = await api.post<ApiSuccess<Invoice>>('/invoices', input)
      return res.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'], exact: false })
      // A new invoice changes the sidebar's Invoices badge count (see
      // AppShell.tsx's getDashboardBadge).
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}
