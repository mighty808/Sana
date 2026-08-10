import { z } from 'zod'
import { PAYMENT_METHODS } from '../models/Payment.js'

// Validates POST /payments request bodies.
export const createPaymentSchema = z.object({
  invoice: z.string().min(1), // Invoice ObjectId — existence + balance checked in the service layer
  amount: z.number().positive(),
  method: z.enum(PAYMENT_METHODS),
  reference: z.string().trim().optional(),
})
