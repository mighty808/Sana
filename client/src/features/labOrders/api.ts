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

// GET /lab-orders?status= — fetches the lab queue. The backend already limits what
// comes back based on the user's role (an Admin sees every order, a Doctor only
// sees their own), so this same one endpoint works for both.
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

// GET /lab-orders?encounter= — fetches every lab order opened from this
// encounter, with each order's results included. This powers the Encounter
// page's "Lab results" section, and returns the same shape as useLabOrder
// above, just as a list instead of a single order.
export function useLabOrdersForEncounter(encounterId: string | undefined) {
  return useQuery({
    queryKey: ['lab-orders', 'encounter', encounterId],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<LabOrderDetail[]>>('/lab-orders', { params: { encounter: encounterId } })
      return res.data.data
    },
    enabled: Boolean(encounterId),
  })
}

// Placing a lab order doesn't change anything the encounter workspace already has
// stored locally (vitals and diagnoses are tracked separately), so only the
// lab-order list and detail data need to be refreshed after this.
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

// PATCH /lab-orders/:id — corrects a lab order's tests/priority/notes.
// Doctor-only ('laborder.update'), and only while still ORDERED (server
// rejects with 409 LAB_ORDER_IN_PROGRESS once a result has been entered).
export interface UpdateLabOrderInput {
  tests: { testName: string }[]
  priority?: LabOrderPriority
  clinicalNotes?: string
}
export function useUpdateLabOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UpdateLabOrderInput }) => {
      const res = await api.patch<ApiSuccess<LabOrder>>(`/lab-orders/${id}`, input)
      return res.data.data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lab-orders'], exact: false }),
  })
}
