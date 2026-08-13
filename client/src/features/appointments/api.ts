import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type ApiSuccess } from '@/lib/api'
import type { Appointment, AppointmentStatus } from '@/types/appointment'

// Mirrors server/src/schemas/appointment.ts's createAppointmentSchema — no
// `doctor` field: only Doctor holds 'appointment.create' now and always
// books for themselves, derived server-side from the caller's own id.
export interface AppointmentInput {
  patient: string
  department: string
  date: string
  startTime: string
  endTime: string
  reason?: string
}

// GET /appointments — the backend itself narrows what comes back based on
// the caller's role (see appointment.service.ts's listAppointments), so
// there's no separate "my appointments" vs "all appointments" query here —
// it's the same one endpoint for every role.
export function useAppointments() {
  return useQuery({
    queryKey: ['appointments'],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<Appointment[]>>('/appointments')
      return res.data.data
    },
  })
}

export function useCreateAppointment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: AppointmentInput) => {
      const res = await api.post<ApiSuccess<Appointment>>('/appointments', input)
      return res.data.data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['appointments'] }),
  })
}

export function useUpdateAppointmentStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: AppointmentStatus }) => {
      const res = await api.patch<ApiSuccess<Appointment>>(`/appointments/${id}/status`, { status })
      return res.data.data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['appointments'] }),
  })
}
