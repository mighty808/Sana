import type { Request, Response } from 'express'
import * as invoiceService from '../services/invoice.service.js'
import * as auditService from '../services/audit.service.js'
import { ok } from '../utils/apiResponse.js'

// POST /invoices — requires 'invoice.create' (Admin only).
export async function create(req: Request, res: Response) {
  const invoice = await invoiceService.createInvoice(req.body)
  await auditService.logAction(req, req.user!.id, 'INVOICE_CREATED', 'Invoice', invoice.id, {
    invoiceNumber: invoice.invoiceNumber,
    total: invoice.total,
  })
  return ok(res, invoice, 201)
}

// GET /invoices?page=&limit= — requires 'invoice.read' (Admin, Patient —
// see listInvoices() for how each is scoped; pagination only applies to
// the Admin "see everything" branch).
export async function list(req: Request, res: Response) {
  const { page, limit } = req.query
  const invoices = await invoiceService.listInvoices(req.user!, {
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
  })
  return ok(res, invoices)
}

// GET /invoices/:id — requires 'invoice.read'.
export async function getById(req: Request, res: Response) {
  const result = await invoiceService.getInvoiceById(req.params.id as string, req.user!)
  return ok(res, result)
}
