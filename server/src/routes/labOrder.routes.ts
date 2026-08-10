import { Router } from 'express'
import { auth } from '../middleware/auth.js'
import { requirePermission } from '../middleware/rbac.js'
import { validate } from '../middleware/validate.js'
import { validateObjectId } from '../middleware/validateObjectId.js'
import { createLabOrderSchema } from '../schemas/labOrder.js'
import * as ctrl from '../controllers/labOrder.controller.js'

const router = Router()

// Mounted at /api/v1/lab-orders in routes/index.ts.

/**
 * @openapi
 * /lab-orders:
 *   post:
 *     summary: Request lab tests during an encounter
 *     tags: [Lab]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [encounter, tests]
 *             properties:
 *               encounter: { type: string, description: Encounter ObjectId }
 *               tests:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [testName]
 *                   properties:
 *                     testName: { type: string }
 *               priority: { type: string, enum: [ROUTINE, URGENT] }
 *               clinicalNotes: { type: string }
 *     responses:
 *       201:
 *         description: Lab order created, with generated labOrderNumber (e.g. LAB-2026-00001).
 *   get:
 *     summary: List lab orders (the lab queue)
 *     tags: [Lab]
 *     description: Admin sees every order. Doctor sees only orders they placed.
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [ORDERED, PROCESSING, COMPLETED, REVIEWED] }
 *     responses:
 *       200:
 *         description: List of lab orders.
 */
router.post('/', auth, requirePermission('laborder.create'), validate(createLabOrderSchema), ctrl.create)
router.get('/', auth, requirePermission('laborder.read'), ctrl.list)

/**
 * @openapi
 * /lab-orders/{id}:
 *   get:
 *     summary: Get a lab order with all results entered against it
 *     tags: [Lab]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: The order plus its results.
 *       404:
 *         description: Lab order not found.
 */
router.get('/:id', auth, validateObjectId('id'), requirePermission('laborder.read'), ctrl.getById)

export default router
