import { z } from 'zod'

// Validates POST /encounters request bodies (a nurse opening an encounter
// at check-in). `appointment` is required because an encounter always comes
// from an existing booked appointment, and it takes its doctor from that
// appointment (see encounter.service.ts).
export const createEncounterSchema = z.object({
  patient: z.string().min(1), // Patient ObjectId
  appointment: z.string().min(1),
  chiefComplaint: z.string().trim().min(1),
  history: z.string().trim().optional(),
})

// Validates POST /encounters/:id/vitals request bodies. Each field is
// optional on its own, because a nurse might not capture every measurement
// every time (for example, no scale on hand to weigh the patient), but at
// least one value must be provided. That "at least one" rule is enforced by
// the .refine() check below rather than making every field required.
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

// Validates PATCH /encounters/:id/vitals/:vitalId request bodies. Same
// shape and "at least one measurement" rule as addVitalsSchema, but each
// field also accepts `null` here — unlike a brand-new record, an existing
// one can have a field that needs to be corrected back to "not recorded,"
// and `null` is how the client says that (see encounter.service.ts's
// updateVitals, which treats null as "clear this measurement" and
// undefined/omitted as "leave it alone").
export const updateVitalsSchema = z
  .object({
    temperature: z.number().nullable().optional(),
    heartRate: z.number().nullable().optional(),
    respiratoryRate: z.number().nullable().optional(),
    systolicBp: z.number().nullable().optional(),
    diastolicBp: z.number().nullable().optional(),
    oxygenSaturation: z.number().nullable().optional(),
    weight: z.number().nullable().optional(),
    height: z.number().nullable().optional(),
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

// Validates PATCH /encounters/:id/diagnoses/:diagnosisId request bodies.
export const updateDiagnosisSchema = addDiagnosisSchema
