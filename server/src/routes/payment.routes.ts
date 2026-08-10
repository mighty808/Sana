import { Router } from 'express'
import { auth } from '../middleware/auth.js'
import { requirePermission } from '../middleware/rbac.js'
import { validate } from '../middleware/validate.js'
import { createPaymentSchema } from '../schemas/payment.js'
import * as ctrl from '../controllers/payment.controller.js'

const router = Router()

// Mounted at /api/v1/payments in routes/index.ts.

/**
 * @openapi
 * /payments:
 *   post:
 *     summary: Record a payment against an invoice
 *     tags: [Billing]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [invoice, amount, method]
 *             properties:
 *               invoice: { type: string, description: Invoice ObjectId }
 *               amount: { type: number, minimum: 0.01 }
 *               method: { type: string, enum: [CASH, CARD, MOBILE_MONEY, INSURANCE] }
 *               reference: { type: string }
 *     responses:
 *       201:
 *         description: Payment recorded; the invoice's amountPaid/balance/status are updated atomically.
 *       400:
 *         description: Payment exceeds the outstanding balance, or the invoice is voided.
 *       404:
 *         description: Invoice not found.
 */
router.post('/', auth, requirePermission('payment.create'), validate(createPaymentSchema), ctrl.create)

export default router
