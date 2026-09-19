import type { Request, Response } from 'express'
import * as invoiceService from '../services/invoice.service.js'
import * as auditService from '../services/audit.service.js'
import { ok } from '../utils/apiResponse.js'

// POST /invoices — requires 'invoice.create' (Admin, Lab Tech, or
// Pharmacist — a Lab Tech/Pharmacist bills the specific order/prescription
// they're processing right after the doctor requests/writes it; Admin can
// still generate either kind directly too).
export async function create(req: Request, res: Response) {
  const invoice = await invoiceService.createInvoice(req.body)
  await auditService.logAction(req, req.user!.id, 'INVOICE_CREATED', 'Invoice', invoice.id, {
    invoiceNumber: invoice.invoiceNumber,
    total: invoice.total,
  })
  return ok(res, invoice, 201)
}

// GET /invoices?page=&limit= — requires 'invoice.read' (Admin, Patient,
// Lab Tech, Pharmacist — see listInvoices() for how each role's results
// are limited). Pagination only applies to the Admin "see everything" branch.
// GET /invoices?labOrder= or ?prescription= — same permission, but returns
// the single invoice (or null) for that lab order/prescription instead of
// a list limited by role. See getInvoiceForLabOrder()/
// getInvoiceForPrescription()'s comments for how they restrict this to patients.
export async function list(req: Request, res: Response) {
  const { page, limit, labOrder, prescription } = req.query
  if (typeof labOrder === 'string') {
    const invoice = await invoiceService.getInvoiceForLabOrder(labOrder, req.user!)
    return ok(res, invoice)
  }
  if (typeof prescription === 'string') {
    const invoice = await invoiceService.getInvoiceForPrescription(prescription, req.user!)
    return ok(res, invoice)
  }
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
