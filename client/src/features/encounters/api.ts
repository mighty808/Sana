import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type ApiSuccess } from '@/lib/api'
import { connectSocket } from '@/lib/socket'
import type { Diagnosis, Encounter, EncounterDetail, EncounterStatus, VitalSign, WardBoardEntry } from '@/types/encounter'

// Matches server/src/schemas/encounter.ts's createEncounterSchema.
export interface EncounterInput {
  patient: string
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

// Same fields as VitalsInput, but each one may also be `null` — matches
// server/src/schemas/encounter.ts's updateVitalsSchema. Correcting an
// existing vitals entry needs a way to say "clear this measurement back to
// not-recorded," and JSON has no way to send "this key is present but
// undefined," so `null` is what the server treats as clear (an
// omitted/undefined key stays untouched instead).
export interface UpdateVitalsInput {
  temperature?: number | null
  heartRate?: number | null
  respiratoryRate?: number | null
  systolicBp?: number | null
  diastolicBp?: number | null
  oxygenSaturation?: number | null
  weight?: number | null
  height?: number | null
}

export interface DiagnosisInput {
  diagnosis: string
  diagnosisCode?: string
  notes?: string
}

// Calls GET /encounters?status=. The server scopes the results by role
// itself: an admin or nurse sees every encounter, while a doctor only sees
// their own (see encounter.service.ts's listEncounters). So this same one
// endpoint works for every role that holds the 'encounter.read' permission.
export function useEncounters(status?: EncounterStatus) {
  return useQuery({
    queryKey: ['encounters', 'list', { status }],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<Encounter[]>>('/encounters', { params: status ? { status } : undefined })
      return res.data.data
    },
  })
}

// Calls GET /encounters/ward-board — every open encounter with its latest
// acuity read, same role scoping as useEncounters above. Kept live by
// useRealtimeWardBoard below (a 'ward-board.changed' socket event
// invalidates this query the moment vitals/a diagnosis/an acuity read/a
// completion happens anywhere). The 30s refetchInterval stays as a fallback
// safety net for a missed or dropped socket connection, not the primary
// update path anymore.
export function useWardBoard() {
  return useQuery({
    queryKey: ['encounters', 'ward-board'],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<WardBoardEntry[]>>('/encounters/ward-board')
      return res.data.data
    },
    refetchInterval: 30_000,
  })
}

// Listens for the 'ward-board.changed' event (see server/src/config/socket.ts's
// broadcastWardBoardChanged, emitted from encounter.service.ts and
// ai.service.ts whenever vitals/a diagnosis/an acuity read/a completion
// happens on any open encounter). Rather than trying to patch the ward
// board's cached data directly, this just triggers a refetch of the real
// endpoint — getWardBoard's role-scoping and its acuity aggregation join are
// exactly the kind of logic that's easy to get subtly wrong re-deriving on
// the client, so the server stays the single source of truth for the
// board's actual contents. Also invalidates each changed encounter's own
// detail query, so a doctor with one open sees fresh data too, at
// negligible extra cost. The server debounces rapid successive writes into
// one event carrying every changed encounter id from that window (rather
// than one event per write), so this can receive more than one id at once.
// Set up once, high up in the component tree (AppShell), the same place and
// lifetime as useRealtimeNotifications.
export function useRealtimeWardBoard() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const socket = connectSocket()

    function handleChanged({ encounterIds }: { encounterIds: string[] }) {
      queryClient.invalidateQueries({ queryKey: ['encounters', 'ward-board'] })
      for (const encounterId of encounterIds) {
        queryClient.invalidateQueries({ queryKey: ['encounters', 'detail', encounterId] })
      }
    }

    socket.on('ward-board.changed', handleChanged)
    return () => {
      socket.off('ward-board.changed', handleChanged)
    }
  }, [queryClient])
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

// Calls PATCH /encounters/:id/vitals/:vitalId — corrects a vitals entry
// that was already recorded, rather than adding a new one. This requires
// the 'vitals.update' permission, which only nurses have.
export function useUpdateVitals(encounterId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ vitalId, input }: { vitalId: string; input: UpdateVitalsInput }) => {
      const res = await api.patch<ApiSuccess<VitalSign>>(`/encounters/${encounterId}/vitals/${vitalId}`, input)
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

// Calls PATCH /encounters/:id/diagnoses/:diagnosisId — corrects a
// diagnosis that was already added. This requires the 'diagnosis.update'
// permission, which only doctors have, and even then only the doctor who
// originally added the diagnosis. The server enforces that: if a different
// doctor tries, they just get the same 404 "not found" response.
export function useUpdateDiagnosis(encounterId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ diagnosisId, input }: { diagnosisId: string; input: DiagnosisInput }) => {
      const res = await api.patch<ApiSuccess<Diagnosis>>(`/encounters/${encounterId}/diagnoses/${diagnosisId}`, input)
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
