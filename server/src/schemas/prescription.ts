import { z } from 'zod'

const medicationSchema = z.object({
  drugName: z.string().trim().min(1),
  dosage: z.string().trim().min(1),
  frequency: z.string().trim().min(1),
  duration: z.string().trim().min(1),
  instructions: z.string().trim().optional(),
})

// Validates POST /encounters/:id/prescriptions request bodies. `encounter`
// isn't part of the body — it comes from the :id route param, the same way
// createReferralSchema doesn't ask for it either.
export const createPrescriptionSchema = z.object({
  medications: z.array(medicationSchema).min(1, 'At least one medication is required'),
})
