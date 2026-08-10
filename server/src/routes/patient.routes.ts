import { Router } from 'express'
import { auth } from '../middleware/auth.js'
import { requirePermission } from '../middleware/rbac.js'
import { validate } from '../middleware/validate.js'
import { validateObjectId } from '../middleware/validateObjectId.js'
import { createPatientSchema, updatePatientSchema } from '../schemas/patient.js'
import * as ctrl from '../controllers/patient.controller.js'

const router = Router()

// Mounted at /api/v1/patients in routes/index.ts.
// Every route here requires 'patient.*' permissions, which only Admin and
// Doctor hold by default (see types/permissions.ts) — Nurse gets read-only
// via 'patient.read' too (to view assigned patients), Patient gets none.

/**
 * @openapi
 * /patients:
 *   post:
 *     summary: Register a new patient
 *     tags: [Patients]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [firstName, lastName, dob, gender]
 *             properties:
 *               firstName: { type: string }
 *               lastName: { type: string }
 *               dob: { type: string, format: date }
 *               gender: { type: string, enum: [MALE, FEMALE, OTHER] }
 *               phone: { type: string }
 *               email: { type: string, format: email }
 *               address: { type: string }
 *               bloodGroup: { type: string }
 *     responses:
 *       201:
 *         description: Patient created, with generated patientNumber (e.g. SAN-2026-00001).
 *   get:
 *     summary: Search/list patients
 *     tags: [Patients]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Free-text search across name, patientNumber, phone.
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated list of patients.
 */
router.post('/', auth, requirePermission('patient.create'), validate(createPatientSchema), ctrl.create)
router.get('/', auth, requirePermission('patient.read'), ctrl.search)

/**
 * @openapi
 * /patients/{id}:
 *   get:
 *     summary: Get one patient by id
 *     tags: [Patients]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Patient record.
 *       404:
 *         description: Patient not found.
 *   patch:
 *     summary: Update a patient's demographic details
 *     tags: [Patients]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Updated patient record.
 *       404:
 *         description: Patient not found.
 */
router.get('/:id', auth, validateObjectId('id'), requirePermission('patient.read'), ctrl.getById)
router.patch(
  '/:id',
  auth,
  validateObjectId('id'),
  requirePermission('patient.update'),
  validate(updatePatientSchema),
  ctrl.update,
)

/**
 * @openapi
 * /patients/{id}/timeline:
 *   get:
 *     summary: Get a patient's chronological event history
 *     tags: [Patients]
 *     description: >
 *       Appointments/encounters/labOrders/invoices arrays are placeholders
 *       until Phases 4, 5, and 7 add those collections.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Patient plus their timeline of events.
 */
router.get('/:id/timeline', auth, validateObjectId('id'), requirePermission('patient.read'), ctrl.timeline)

export default router
