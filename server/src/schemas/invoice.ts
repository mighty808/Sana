import { z } from 'zod'

// Validates POST /invoices request bodies. `amount` per item is intentionally
// NOT accepted here — it's always computed server-side as qty * unitPrice
// (see invoice.service.ts) so a caller can't submit a mismatched total.
export const createInvoiceSchema = z.object({
  encounter: z.string().min(1), // Encounter ObjectId — existence checked in the service layer
  items: z
    .array(
      z.object({
        description: z.string().trim().min(1),
        qty: z.number().int().min(1),
        unitPrice: z.number().min(0),
      }),
    )
    .min(1, 'At least one line item is required'),
})
