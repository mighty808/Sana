import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type ApiSuccess } from '@/lib/api'
import type { Diagnosis, Encounter, EncounterDetail, EncounterStatus, VitalSign } from '@/types/encounter'

// Mirrors server/src/schemas/encounter.ts's createEncounterSchema.
export interface EncounterInput {
  patient: string
  department: string
  appointment: string
  chiefComplaint: string
  history?: string
}

export interface VitalsInput {
  temperature?: number
  heartRate?: number
  respiratoryRate?: number
  systolicBp?: number
  diastolicBp?: number
  oxygenSaturation?: number
  weight?: number
  height?: number
}

export interface DiagnosisInput {
  diagnosis: string
  diagnosisCode?: string
  notes?: string
}

// GET /encounters?status= — backend itself scopes by role (Admin/Nurse see
// every encounter, Doctor sees only their own — see encounter.service.ts's
// listEncounters), so this is the same one endpoint for every role holding
// 'encounter.read'.
export function useEncounters(status?: EncounterStatus) {
  return useQuery({
    queryKey: ['encounters', 'list', { status }],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<Encounter[]>>('/encounters', { params: status ? { status } : undefined })
      return res.data.data
    },
  })
}

export function useEncounter(id: string | undefined) {
  return useQuery({
    queryKey: ['encounters', 'detail', id],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<EncounterDetail>>(`/encounters/${id}`)
      return res.data.data
    },
    enabled: Boolean(id),
  })
}

export function useCreateEncounter() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: EncounterInput) => {
      const res = await api.post<ApiSuccess<Encounter>>('/encounters', input)
      return res.data.data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['encounters', 'list'] }),
  })
}

export function useAddVitals(encounterId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: VitalsInput) => {
      const res = await api.post<ApiSuccess<VitalSign>>(`/encounters/${encounterId}/vitals`, input)
      return res.data.data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['encounters', 'detail', encounterId] }),
  })
}

export function useAddDiagnosis(encounterId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: DiagnosisInput) => {
      const res = await api.post<ApiSuccess<Diagnosis>>(`/encounters/${encounterId}/diagnoses`, input)
      return res.data.data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['encounters', 'detail', encounterId] }),
  })
}

export function useCompleteEncounter(encounterId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await api.patch<ApiSuccess<Encounter>>(`/encounters/${encounterId}/complete`)
      return res.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['encounters', 'detail', encounterId] })
      queryClient.invalidateQueries({ queryKey: ['encounters', 'list'] })
    },
  })
}
