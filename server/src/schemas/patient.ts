import { z } from 'zod'

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'UNKNOWN'] as const

// Validates POST /patients request bodies (registering a new patient).
// `z.coerce.date()` accepts the ISO date string the frontend sends (e.g.
// "1990-05-12") and turns it into a real JS Date before it reaches Mongoose.
export const createPatientSchema = z.object({
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  dob: z.coerce.date(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']),
  phone: z.string().trim().optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  address: z.string().trim().optional(),
  bloodGroup: z.enum(BLOOD_GROUPS).optional(),
  emergencyContact: z
    .object({
      name: z.string().trim().optional(),
      phone: z.string().trim().optional(),
    })
    .optional(),
})

// Validates PATCH /patients/:id request bodies — everything optional so a
// caller can send just the fields they're changing (e.g. only `phone`).
export const updatePatientSchema = createPatientSchema.partial()
