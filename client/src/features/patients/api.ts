import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type ApiSuccess } from '@/lib/api'
import type { Patient, PatientSearchResult, PatientTimeline } from '@/types/patient'

// The exact body POST/PATCH /patients accepts — mirrors
// server/src/schemas/patient.ts's createPatientSchema field-for-field so
// the form never sends something the backend would reject on shape alone.
export interface PatientInput {
  firstName: string
  lastName: string
  dob: string
  gender: 'MALE' | 'FEMALE' | 'OTHER'
  phone?: string
  email?: string
  address?: string
  bloodGroup?: Patient['bloodGroup']
  emergencyContact?: { name?: string; phone?: string }
}

// GET /patients?search=&page=&limit= — the list/search screen's data
// source. `search` participates in the query key so switching search terms
// or pages is its own cached entry, and TanStack Query refetches
// automatically whenever any of these change.
export function usePatients(params: { search?: string; page: number; limit: number }) {
  return useQuery({
    queryKey: ['patients', params],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<PatientSearchResult>>('/patients', { params })
      return res.data.data
    },
    // Keeps showing the previous page's rows while the next page loads,
    // instead of flashing a loading state on every pagination click.
    placeholderData: (prev) => prev,
  })
}

export function usePatient(id: string | undefined) {
  return useQuery({
    queryKey: ['patients', 'detail', id],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<Patient>>(`/patients/${id}`)
      return res.data.data
    },
    enabled: Boolean(id),
  })
}

export function usePatientTimeline(id: string | undefined) {
  return useQuery({
    queryKey: ['patients', 'timeline', id],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<PatientTimeline>>(`/patients/${id}/timeline`)
      return res.data.data
    },
    enabled: Boolean(id),
  })
}

export function useCreatePatient() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: PatientInput) => {
      const res = await api.post<ApiSuccess<Patient>>('/patients', input)
      return res.data.data
    },
    // Invalidate every cached patients list/search so the new patient
    // shows up immediately, regardless of which page/search term is active.
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patients'], exact: false })
    },
  })
}

export function useUpdatePatient(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: Partial<PatientInput>) => {
      const res = await api.patch<ApiSuccess<Patient>>(`/patients/${id}`, input)
      return res.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patients'], exact: false })
    },
  })
}
