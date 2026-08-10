import { z } from 'zod'
import { LAB_ORDER_PRIORITIES } from '../models/LabOrder.js'

// Validates POST /lab-orders request bodies (a doctor ordering tests during an encounter).
export const createLabOrderSchema = z.object({
  encounter: z.string().min(1), // Encounter ObjectId — existence checked in the service layer
  tests: z.array(z.object({ testName: z.string().trim().min(1) })).min(1, 'At least one test is required'),
  priority: z.enum(LAB_ORDER_PRIORITIES).optional(),
  clinicalNotes: z.string().trim().optional(),
})
