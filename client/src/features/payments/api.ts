import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type ApiSuccess } from '@/lib/api'
import type { Payment, PaymentMethod } from '@/types/payment'

export interface PaymentInput {
  invoice: string
  amount: number
  method: PaymentMethod
  reference?: string
}

// Recording a payment also updates the invoice's own amount-paid, balance, and
// status on the server as one combined operation (see payment.service.ts), so
// both the invoice detail data and the invoices list need to be refreshed
// afterward. There's no separate "payments" list to refresh, since one doesn't exist.
export function useCreatePayment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: PaymentInput) => {
      const res = await api.post<ApiSuccess<Payment>>('/payments', input)
      return res.data.data
    },
    onSuccess: (_payment, variables) => {
      queryClient.invalidateQueries({ queryKey: ['invoices', 'detail', variables.invoice] })
      queryClient.invalidateQueries({ queryKey: ['invoices'], exact: false })
      // A payment can close out an invoice (UNPAID/PARTIALLY_PAID -> PAID),
      // which changes the sidebar's Invoices badge (see AppShell.tsx's
      // getDashboardBadge) — keeps it live in-session.
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}
