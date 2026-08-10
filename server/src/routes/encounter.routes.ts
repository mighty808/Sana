import { Router } from 'express'
import { auth } from '../middleware/auth.js'
import { requirePermission } from '../middleware/rbac.js'
import { validate } from '../middleware/validate.js'
import { validateObjectId } from '../middleware/validateObjectId.js'
import { createEncounterSchema, addVitalsSchema, addDiagnosisSchema } from '../schemas/encounter.js'
import * as ctrl from '../controllers/encounter.controller.js'

const router = Router()

// Mounted at /api/v1/encounters in routes/index.ts.

/**
 * @openapi
 * /encounters:
 *   post:
 *     summary: Open a new clinical encounter
 *     tags: [Encounters]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [patient, department, chiefComplaint]
 *             properties:
 *               patient: { type: string, description: Patient ObjectId }
 *               department: { type: string, description: Department ObjectId }
 *               appointment: { type: string, description: Optional Appointment ObjectId this encounter came from }
 *               chiefComplaint: { type: string }
 *               history: { type: string }
 *     responses:
 *       201:
 *         description: Encounter created. The requesting doctor becomes the encounter's doctor.
 */
router.post('/', auth, requirePermission('encounter.create'), validate(createEncounterSchema), ctrl.create)

/**
 * @openapi
 * /encounters/{id}:
 *   get:
 *     summary: Get encounter details, including its vitals and diagnoses
 *     tags: [Encounters]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: The encounter plus its recorded vitals and diagnoses.
 *       404:
 *         description: Encounter not found.
 */
router.get('/:id', auth, validateObjectId('id'), requirePermission('encounter.read'), ctrl.getById)

/**
 * @openapi
 * /encounters/{id}/vitals:
 *   post:
 *     summary: Record a set of vitals against an encounter
 *     tags: [Encounters]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               temperature: { type: number }
 *               heartRate: { type: number }
 *               respiratoryRate: { type: number }
 *               systolicBp: { type: number }
 *               diastolicBp: { type: number }
 *               oxygenSaturation: { type: number }
 *               weight: { type: number }
 *               height: { type: number }
 *     responses:
 *       201:
 *         description: Vitals recorded.
 *       404:
 *         description: Encounter not found.
 */
router.post(
  '/:id/vitals',
  auth,
  validateObjectId('id'),
  requirePermission('vitals.create'),
  validate(addVitalsSchema),
  ctrl.addVitals,
)

/**
 * @openapi
 * /encounters/{id}/diagnoses:
 *   post:
 *     summary: Add a diagnosis to an encounter
 *     tags: [Encounters]
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
 *             required: [diagnosis]
 *             properties:
 *               diagnosis: { type: string }
 *               diagnosisCode: { type: string }
 *               notes: { type: string }
 *     responses:
 *       201:
 *         description: Diagnosis added.
 *       404:
 *         description: Encounter not found.
 */
router.post(
  '/:id/diagnoses',
  auth,
  validateObjectId('id'),
  requirePermission('diagnosis.create'),
  validate(addDiagnosisSchema),
  ctrl.addDiagnosis,
)

export default router
