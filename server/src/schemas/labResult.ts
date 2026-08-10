import { z } from 'zod'
import { LAB_RESULT_INTERPRETATIONS } from '../models/LabResult.js'

// Validates POST /lab-results request bodies (staff entering one test's result).
export const createLabResultSchema = z.object({
  labOrder: z.string().min(1), // LabOrder ObjectId — existence + testName match checked in the service layer
  testName: z.string().trim().min(1),
  resultValue: z.string().trim().min(1),
  unit: z.string().trim().optional(),
  referenceRange: z.string().trim().optional(),
  interpretation: z.enum(LAB_RESULT_INTERPRETATIONS).optional(),
  notes: z.string().trim().optional(),
})
