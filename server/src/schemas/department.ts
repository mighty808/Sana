import { z } from 'zod'

// Validates POST /departments request bodies.
export const createDepartmentSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().optional(),
})

// Validates PATCH /departments/:id request bodies — all fields optional
// since a partial update should only change the fields actually sent.
export const updateDepartmentSchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().trim().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
})
