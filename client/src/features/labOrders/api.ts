import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type ApiSuccess } from '@/lib/api'
import type { LabOrder, LabOrderDetail, LabOrderPriority, LabOrderStatus } from '@/types/labOrder'

// Mirrors server/src/schemas/labOrder.ts's createLabOrderSchema.
export interface LabOrderInput {
  encounter: string
  tests: { testName: string }[]
  priority?: LabOrderPriority
  clinicalNotes?: string
}

// GET /lab-orders?status= — the lab queue. Backend itself scopes by role
// (Admin sees every order, Doctor only their own), so this is the same one
// endpoint for both.
export function useLabOrders(status?: LabOrderStatus) {
  return useQuery({
    queryKey: ['lab-orders', { status }],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<LabOrder[]>>('/lab-orders', { params: status ? { status } : undefined })
      return res.data.data
    },
  })
}

export function useLabOrder(id: string | undefined) {
  return useQuery({
    queryKey: ['lab-orders', 'detail', id],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<LabOrderDetail>>(`/lab-orders/${id}`)
      return res.data.data
    },
    enabled: Boolean(id),
  })
}

// Ordering a lab test doesn't change anything the encounter workspace
// already has cached (vitals/diagnoses live separately), so only the
// lab-orders list/detail caches need invalidating.
export function useCreateLabOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: LabOrderInput) => {
      const res = await api.post<ApiSuccess<LabOrder>>('/lab-orders', input)
      return res.data.data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lab-orders'], exact: false }),
  })
}
