import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type ApiSuccess } from '@/lib/api'
import type { Appointment, AppointmentStatus } from '@/types/appointment'

// Matches server/src/schemas/appointment.ts's createAppointmentSchema. The
// `doctor` field is required here because only a nurse holds the
// 'appointment.create' permission now, and a nurse has no doctor identity of
// her own for the system to assume. So she has to pick which doctor the
// appointment is for (see the doctor picker on BookAppointmentDialog, backed
// by useDoctors()).
export interface AppointmentInput {
  patient: string
  doctor: string
  date: string
  startTime: string
  endTime: string
  reason?: string
}

// Calls GET /appointments. The server itself decides what to return based
// on the logged-in user's role (see appointment.service.ts's
// listAppointments), so there's no separate "my appointments" versus "all
// appointments" query here. Every role uses this same one endpoint.
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
