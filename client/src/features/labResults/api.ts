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

// GET /lab-results — the backend already limits what comes back based on the
// user's role: an Admin gets all results, a Doctor gets results for orders they
// placed, and a Patient only gets their own results that have been released.
export function useLabResults() {
  return useQuery({
    queryKey: ['lab-results'],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<LabResult[]>>('/lab-results')
      return res.data.data
    },
  })
}

// Entering a result also changes the status of that test on the parent lab order
// on the server (and possibly the order's overall status too), so both the
// lab-results and lab-orders data need to be refreshed, not just lab-results.
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lab-results'], exact: false })
      // The lab order detail dialog (LabOrdersPage) also shows each result's
      // status, fetched via useLabOrder, so that data needs to reflect the new
      // RELEASED status too, not just the standalone results list.
      queryClient.invalidateQueries({ queryKey: ['lab-orders'], exact: false })
    },
  })
}
