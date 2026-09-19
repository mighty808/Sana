import { Router } from 'express'
import { auth } from '../middleware/auth.js'
import { requirePermission } from '../middleware/rbac.js'
import { validateObjectId } from '../middleware/validateObjectId.js'
import * as ctrl from '../controllers/prescription.controller.js'

const router = Router()

// Mounted at /api/v1/prescriptions in routes/index.ts. Writing a
// prescription is POST /encounters/:id/prescriptions instead (see
// encounter.routes.ts) — it's scoped to the encounter it came from, the
// same way diagnoses/referrals are. This router covers the pharmacy queue
// (role-scoped list) and dispensing.

/**
 * @openapi
 * /prescriptions:
 *   get:
 *     summary: List prescriptions
 *     tags: [Prescriptions]
 *     description: >
 *       Role-scoped — Admin/Pharmacist see every prescription (the pharmacy
 *       queue), Doctor sees only their own, Patient sees their own.
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [PRESCRIBED, DISPENSED, CANCELLED] }
 *     responses:
 *       200:
 *         description: List of prescriptions, newest first.
 */
router.get('/', auth, requirePermission('prescription.read'), ctrl.list)

/**
 * @openapi
 * /prescriptions/{id}/dispense:
 *   patch:
 *     summary: Dispense a prescription
 *     tags: [Prescriptions]
 *     description: >
 *       Pharmacist only ('prescription.dispense'). A single atomic action —
 *       every medication on the prescription is handed over at once, and it
 *       can only be dispensed while still PRESCRIBED.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Dispensed prescription.
 *       409:
 *         description: Not found, or already dispensed/cancelled.
 */
router.patch('/:id/dispense', auth, validateObjectId('id'), requirePermission('prescription.dispense'), ctrl.dispense)

export default router
