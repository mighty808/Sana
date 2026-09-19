import { z } from 'zod'

// Validates POST /invoices request bodies. There is no `amount` field per
// item on purpose. The server always calculates it itself as qty * unitPrice
// (see invoice.service.ts), so a caller can't send in a total that doesn't
// actually match the line items.
//
// Exactly one of `labOrder`/`prescription` must be given — an invoice
// always bills exactly one billable thing (see invoice.service.ts's
// createInvoice and models/Invoice.ts's comment on why both fields exist).
export const createInvoiceSchema = z
  .object({
    labOrder: z.string().min(1).optional(), // LabOrder ObjectId — existence checked in the service layer
    prescription: z.string().min(1).optional(), // Prescription ObjectId — existence checked in the service layer
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
  .refine((data) => Boolean(data.labOrder) !== Boolean(data.prescription), {
    message: 'Provide exactly one of labOrder or prescription',
    path: ['labOrder'],
  })
