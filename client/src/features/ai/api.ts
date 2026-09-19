import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type ApiSuccess } from '@/lib/api'
import type { AiConsultation, AiReviewStatus } from '@/types/aiConsultation'

// Matches server/src/schemas/ai.ts's consultAiSchema. The chief complaint and
// vitals are not sent from the client at all. Instead the server pulls them
// itself from the encounter record (see ai.service.ts's buildAnonymizedContext).
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

// This hook does not handle errors itself, unlike most of the mutations in
// this file. That is because a 503 AI_SERVICE_UNAVAILABLE response is a
// normal, expected outcome here, not just a generic failure (see
// ai.service.ts's graceful-degradation comment). So instead of showing a
// generic error toast, the calling component decides how to display it.
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

// Matches server/src/schemas/ai.ts's analyzeVitalsSchema. This is for
// nurses only: it requires the 'ai.analyzeVitals' permission, not the
// 'ai.consult' permission that only doctors have.
export interface AnalyzeVitalsInput {
  encounter: string
  notes?: string
}

export function useAnalyzeVitals() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: AnalyzeVitalsInput) => {
      const res = await api.post<ApiSuccess<AiConsultation>>('/ai/analyze-vitals', input)
      return res.data.data
    },
    onSuccess: (_data, variables) =>
      queryClient.invalidateQueries({ queryKey: ['ai-consultations', variables.encounter] }),
  })
}

// Matches server/src/schemas/ai.ts's explainLabResultSchema exactly — this
// is for lab techs only (needs 'ai.explainLabResult', not the doctor-only
// 'ai.consult'), and these are the only two fields the server accepts.
interface ExplainLabResultPayload {
  labResult: string
  notes?: string
}

// The mutation's actual input: the wire payload above, plus `labOrder`,
// which is never sent to the server (mutationFn strips it out below) — it
// only exists so onSuccess can invalidate the right cached query, without
// the calling component having to remember to do that itself.
export interface ExplainLabResultInput extends ExplainLabResultPayload {
  labOrder: string
}

export function useExplainLabResult() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ labOrder: _labOrder, ...payload }: ExplainLabResultInput) => {
      const res = await api.post<ApiSuccess<AiConsultation>>('/ai/explain-lab-result', payload satisfies ExplainLabResultPayload)
      return res.data.data
    },
    onSuccess: (_data, variables) =>
      queryClient.invalidateQueries({ queryKey: ['ai-lab-order-analyses', variables.labOrder] }),
  })
}

// Fetches the AI explanations for every result in one lab order with a
// single call (see ai.service.ts's listConsultationsForLabOrder), rather
// than making a separate request per result. Whatever calls this then splits
// the returned list back apart per result itself.
export function useLabOrderResultAnalyses(labOrderId: string | undefined) {
  return useQuery({
    queryKey: ['ai-lab-order-analyses', labOrderId],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<AiConsultation[]>>(`/ai/consultations/lab-order/${labOrderId}`)
      return res.data.data
    },
    enabled: Boolean(labOrderId),
  })
}
