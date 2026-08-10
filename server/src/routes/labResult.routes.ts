import { Router } from 'express'
import { auth } from '../middleware/auth.js'
import { requirePermission } from '../middleware/rbac.js'
import { validate } from '../middleware/validate.js'
import { validateObjectId } from '../middleware/validateObjectId.js'
import { createLabResultSchema } from '../schemas/labResult.js'
import * as ctrl from '../controllers/labResult.controller.js'

const router = Router()

// Mounted at /api/v1/lab-results in routes/index.ts.

/**
 * @openapi
 * /lab-results:
 *   post:
 *     summary: Enter a result for one test on a lab order
 *     tags: [Lab]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [labOrder, testName, resultValue]
 *             properties:
 *               labOrder: { type: string, description: LabOrder ObjectId }
 *               testName: { type: string, description: Must match one of the order's requested tests }
 *               resultValue: { type: string }
 *               unit: { type: string }
 *               referenceRange: { type: string }
 *               interpretation: { type: string, enum: [NORMAL, ABNORMAL, CRITICAL] }
 *               notes: { type: string }
 *     responses:
 *       201:
 *         description: Result entered. Starts as ENTERED (staff-only) until released.
 *       400:
 *         description: testName doesn't match any test requested on the order.
 *   get:
 *     summary: List lab results
 *     tags: [Lab]
 *     description: >
 *       Admin sees all results. Doctor sees results for orders they placed.
 *       Patient sees only their own RELEASED results.
 *     responses:
 *       200:
 *         description: List of lab results.
 */
router.post('/', auth, requirePermission('labresult.create'), validate(createLabResultSchema), ctrl.create)
router.get('/', auth, requirePermission('labresult.read'), ctrl.list)

/**
 * @openapi
 * /lab-results/{id}/release:
 *   patch:
 *     summary: Release a result, making it visible to the patient
 *     tags: [Lab]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Released result.
 *       404:
 *         description: Lab result not found.
 *       409:
 *         description: Result was already released.
 */
router.patch('/:id/release', auth, validateObjectId('id'), requirePermission('labresult.release'), ctrl.release)

export default router
