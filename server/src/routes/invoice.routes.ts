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
 *     summary: Generate an invoice from a lab order or a prescription
 *     tags: [Billing]
 *     description: >
 *       Admin, Lab Tech, or Pharmacist. One invoice per lab order or
 *       prescription (exactly one of `labOrder`/`prescription` must be
 *       given) — typically issued by the Lab Tech/Pharmacist for the
 *       order/prescription they're processing, right after the doctor
 *       requests/writes it.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [items]
 *             properties:
 *               labOrder: { type: string, description: LabOrder ObjectId — provide this or prescription, not both }
 *               prescription: { type: string, description: Prescription ObjectId — provide this or labOrder, not both }
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
 *         description: This lab order/prescription already has a non-voided invoice.
 *   get:
 *     summary: List invoices, or fetch the one for a specific lab order or prescription
 *     tags: [Billing]
 *     description: >
 *       Admin sees every invoice; a Patient sees only their own. Pass
 *       `labOrder` or `prescription` instead to fetch that specific one's
 *       invoice directly (or null if it has none). This is what Lab
 *       Tech/Pharmacist use to bill or check payment status while processing.
 *     parameters:
 *       - in: query
 *         name: labOrder
 *         required: false
 *         schema: { type: string }
 *         description: LabOrder ObjectId — returns that order's invoice (or null) instead of a list.
 *       - in: query
 *         name: prescription
 *         required: false
 *         schema: { type: string }
 *         description: Prescription ObjectId — returns that prescription's invoice (or null) instead of a list.
 *     responses:
 *       200:
 *         description: List of invoices, or a single invoice (or null) when `labOrder`/`prescription` is passed.
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
