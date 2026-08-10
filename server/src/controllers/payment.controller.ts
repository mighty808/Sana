import type { Request, Response } from 'express'
import * as paymentService from '../services/payment.service.js'
import * as auditService from '../services/audit.service.js'
import { ok } from '../utils/apiResponse.js'

// POST /payments — requires 'payment.create' (Admin only).
export async function create(req: Request, res: Response) {
  const payment = await paymentService.recordPayment(req.body, req.user!.id)
  await auditService.logAction(req, req.user!.id, 'PAYMENT_RECORDED', 'Payment', payment.id, {
    invoice: req.body.invoice,
    amount: payment.amount,
    method: payment.method,
  })
  return ok(res, payment, 201)
}
