import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type ApiSuccess } from '@/lib/api'
import type { LabResult, LabResultInterpretation } from '@/types/labResult'

// Mirrors server/src/schemas/labResult.ts's createLabResultSchema.
export interface LabResultInput {
  labOrder: string
  testName: string
  resultValue: string
  unit?: string
  referenceRange?: string
  interpretation?: LabResultInterpretation
  notes?: string
}

// GET /lab-results — role-scoped server-side (Admin: all, Doctor: results
// for orders they placed, Patient: only their own RELEASED results).
export function useLabResults() {
  return useQuery({
    queryKey: ['lab-results'],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<LabResult[]>>('/lab-results')
      return res.data.data
    },
  })
}

// Entering a result also flips the parent lab order's test-item status
// (and possibly its overall status) server-side, so both caches need
// invalidating, not just lab-results.
export function useCreateLabResult() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: LabResultInput) => {
      const res = await api.post<ApiSuccess<LabResult>>('/lab-results', input)
      return res.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lab-results'], exact: false })
      queryClient.invalidateQueries({ queryKey: ['lab-orders'], exact: false })
    },
  })
}

export function useReleaseLabResult() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.patch<ApiSuccess<LabResult>>(`/lab-results/${id}/release`)
      return res.data.data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lab-results'], exact: false }),
  })
}
