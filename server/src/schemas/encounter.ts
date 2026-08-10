import { z } from 'zod'

// Validates POST /encounters request bodies (a doctor opening an encounter).
export const createEncounterSchema = z.object({
  patient: z.string().min(1), // Patient ObjectId
  department: z.string().min(1), // Department ObjectId
  appointment: z.string().min(1).optional(), // Appointment ObjectId, if this encounter came from a booked slot
  chiefComplaint: z.string().trim().min(1),
  history: z.string().trim().optional(),
})

// Validates POST /encounters/:id/vitals request bodies. All fields optional
// individually (a nurse might not capture every measurement every time),
// but at least one value should be provided — enforced with .refine below
// rather than making everything required, since real vitals capture is
// often partial (e.g. no scale on hand to weigh the patient).
export const addVitalsSchema = z
  .object({
    temperature: z.number().optional(),
    heartRate: z.number().optional(),
    respiratoryRate: z.number().optional(),
    systolicBp: z.number().optional(),
    diastolicBp: z.number().optional(),
    oxygenSaturation: z.number().optional(),
    weight: z.number().optional(),
    height: z.number().optional(),
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: 'At least one vital sign measurement is required',
  })

// Validates POST /encounters/:id/diagnoses request bodies.
export const addDiagnosisSchema = z.object({
  diagnosis: z.string().trim().min(1),
  diagnosisCode: z.string().trim().optional(),
  notes: z.string().trim().optional(),
})
