import { Router } from 'express'
import { auth } from '../middleware/auth.js'
import { requirePermission } from '../middleware/rbac.js'
import { validate } from '../middleware/validate.js'
import { validateObjectId } from '../middleware/validateObjectId.js'
import { createInvoiceSchema } from '../schemas/invoice.js'
import * as ctrl from '../controllers/invoice.controller.js'

const router = Router()

// Mounted at /api/v1/invoices in routes/index.ts.

/**
 * @openapi
 * /invoices:
 *   post:
 *     summary: Generate an invoice from a completed encounter
 *     tags: [Billing]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [encounter, items]
 *             properties:
 *               encounter: { type: string, description: Encounter ObjectId }
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [description, qty, unitPrice]
 *                   properties:
 *                     description: { type: string }
 *                     qty: { type: integer, minimum: 1 }
 *                     unitPrice: { type: number, minimum: 0 }
 *     responses:
 *       201:
 *         description: Invoice created, with generated invoiceNumber (e.g. INV-2026-00001).
 *       409:
 *         description: This encounter already has a non-voided invoice.
 *   get:
 *     summary: List invoices
 *     tags: [Billing]
 *     description: Admin sees every invoice. Patient sees only their own.
 *     responses:
 *       200:
 *         description: List of invoices.
 */
router.post('/', auth, requirePermission('invoice.create'), validate(createInvoiceSchema), ctrl.create)
router.get('/', auth, requirePermission('invoice.read'), ctrl.list)

/**
 * @openapi
 * /invoices/{id}:
 *   get:
 *     summary: Get an invoice with its payment history
 *     tags: [Billing]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: The invoice plus every payment recorded against it.
 *       404:
 *         description: Invoice not found (or belongs to a different patient).
 */
router.get('/:id', auth, validateObjectId('id'), requirePermission('invoice.read'), ctrl.getById)

export default router
