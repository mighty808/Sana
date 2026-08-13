import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type ApiSuccess } from '@/lib/api'
import type { Invoice, InvoiceDetail } from '@/types/invoice'

// Mirrors server/src/schemas/invoice.ts's createInvoiceSchema — `amount`
// per item is deliberately not sent, the backend always computes it as
// qty * unitPrice itself.
export interface InvoiceItemInput {
  description: string
  qty: number
  unitPrice: number
}

export interface InvoiceInput {
  encounter: string
  items: InvoiceItemInput[]
}

// GET /invoices?page=&limit= — unlike patients/appointments, this endpoint
// returns a PLAIN array with no {total, pages} metadata at all (see
// invoice.service.ts's listInvoices — both branches just return an array).
// The page component treats "fewer rows than `limit` came back" as "this is
// the last page" rather than relying on a total count the API doesn't give.
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['invoices'], exact: false }),
  })
}
