import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type ApiSuccess } from '@/lib/api'
import type { Payment, PaymentMethod } from '@/types/payment'

export interface PaymentInput {
  invoice: string
  amount: number
  method: PaymentMethod
  reference?: string
}

// Recording a payment updates the invoice's own amountPaid/balance/status
// server-side (one atomic transaction — see payment.service.ts), so both
// the invoice detail cache and the invoices list need invalidating, not
// just... there being no separate "payments" list endpoint to invalidate.
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
    },
  })
}
