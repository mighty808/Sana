import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type ApiSuccess } from '@/lib/api'
import type { AiConsultation, AiReviewStatus } from '@/types/aiConsultation'

// Mirrors server/src/schemas/ai.ts's consultAiSchema — chiefComplaint and
// vitals are pulled automatically server-side from the encounter, never
// sent from the client (see ai.service.ts's buildAnonymizedContext).
export interface ConsultAiInput {
  encounter: string
  query: string
  symptoms?: string[]
}

export interface ReviewConsultationInput {
  reviewStatus: AiReviewStatus
  doctorComment?: string
}

export function useAiConsultations(encounterId: string | undefined) {
  return useQuery({
    queryKey: ['ai-consultations', encounterId],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<AiConsultation[]>>('/ai/consultations', {
        params: { encounter: encounterId },
      })
      return res.data.data
    },
    enabled: Boolean(encounterId),
  })
}

// Deliberately no onError handling baked into the hook itself (unlike most
// mutations here) — a 503 AI_SERVICE_UNAVAILABLE is an expected, normal
// outcome for this endpoint (see ai.service.ts's graceful-degradation
// comment), not just a generic failure, so the caller decides how to
// present it rather than a blanket toast.
export function useConsultAi(encounterId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: Omit<ConsultAiInput, 'encounter'>) => {
      const res = await api.post<ApiSuccess<AiConsultation>>('/ai/consult', { ...input, encounter: encounterId })
      return res.data.data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ai-consultations', encounterId] }),
  })
}

export function useReviewConsultation(encounterId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...input }: ReviewConsultationInput & { id: string }) => {
      const res = await api.post<ApiSuccess<AiConsultation>>(`/ai/consultations/${id}/review`, input)
      return res.data.data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ai-consultations', encounterId] }),
  })
}
