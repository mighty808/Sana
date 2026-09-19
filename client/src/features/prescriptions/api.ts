import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type ApiSuccess } from '@/lib/api'
import type { MedicationItem, Prescription, PrescriptionStatus } from '@/types/prescription'

// Mirrors server/src/schemas/prescription.ts's createPrescriptionSchema.
export interface PrescriptionInput {
  medications: MedicationItem[]
}

// GET /prescriptions?status= — the pharmacy queue (or a doctor's/patient's
// own, depending on role — the backend already scopes this per role, see
// prescription.service.ts's listPrescriptions).
export function usePrescriptions(status?: PrescriptionStatus) {
  return useQuery({
    queryKey: ['prescriptions', { status }],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<Prescription[]>>('/prescriptions', { params: status ? { status } : undefined })
      return res.data.data
    },
  })
}

// POST /encounters/:id/prescriptions
export function useCreatePrescription(encounterId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: PrescriptionInput) => {
      const res = await api.post<ApiSuccess<Prescription>>(`/encounters/${encounterId}/prescriptions`, input)
      return res.data.data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['encounters', 'detail', encounterId] }),
  })
}

// PATCH /prescriptions/:id/dispense — Pharmacist only.
export function useDispensePrescription() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.patch<ApiSuccess<Prescription>>(`/prescriptions/${id}/dispense`)
      return res.data.data
    },
    // A prescription is shown in two unrelated places, so both caches have
    // to be refreshed: the /prescriptions queue the pharmacist is looking
    // at, and the Prescriptions card on the encounter it was written from,
    // which arrives inside that encounter's own detail query. Without the
    // second one, a doctor with the encounter page open still sees
    // PRESCRIBED after the pharmacist has dispensed it. The updated
    // prescription that comes back carries its own `encounter` id, so this
    // invalidates exactly that one encounter rather than every cached one.
    onSuccess: (prescription) => {
      queryClient.invalidateQueries({ queryKey: ['prescriptions'], exact: false })
      queryClient.invalidateQueries({ queryKey: ['encounters', 'detail', prescription.encounter] })
    },
  })
}
