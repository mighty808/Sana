import { Router } from 'express'
import { auth } from '../middleware/auth.js'
import { requirePermission } from '../middleware/rbac.js'
import { validate } from '../middleware/validate.js'
import { validateObjectId } from '../middleware/validateObjectId.js'
import { createLabOrderSchema, updateLabOrderSchema } from '../schemas/labOrder.js'
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
 *     summary: List lab orders (the lab queue), or one encounter's orders with results
 *     tags: [Lab]
 *     description: >
 *       Without an `encounter` parameter, this returns the plain lab queue,
 *       limited by role: Admin and Lab Tech see every order, while Doctor
 *       sees only the orders they placed themselves.
 *       With `encounter`, it returns every order opened from that
 *       encounter, each with its results included, regardless of the
 *       caller's role. (This works the same way as GET /encounters/:id,
 *       where looking something up directly by id stays open to everyone.)
 *       This is what powers the "Lab results" section on the Encounter page.
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [ORDERED, PROCESSING, COMPLETED, REVIEWED] }
 *       - in: query
 *         name: encounter
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: List of lab orders (or, with `encounter`, {order, results}[]).
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
 *   patch:
 *     summary: Correct a lab order's requested tests/priority/notes
 *     tags: [Lab]
 *     description: >
 *       Doctor only ('laborder.update'), and only the doctor who placed the
 *       order. This only works while the order is still in the ORDERED
 *       state. Once a lab tech has started entering results, the requested
 *       tests can no longer be changed, so the lab tech isn't working from
 *       an order that shifted underneath them.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tests]
 *             properties:
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
 *       200:
 *         description: Updated lab order.
 *       404:
 *         description: Lab order not found (or not yours).
 *       409:
 *         description: Order already has results entered (LAB_ORDER_IN_PROGRESS).
 */
router.get('/:id', auth, validateObjectId('id'), requirePermission('laborder.read'), ctrl.getById)
router.patch(
  '/:id',
  auth,
  validateObjectId('id'),
  requirePermission('laborder.update'),
  validate(updateLabOrderSchema),
  ctrl.update,
)

export default router
