import { Router } from 'express'
import { auth } from '../middleware/auth.js'
import { requirePermission } from '../middleware/rbac.js'
import { validate } from '../middleware/validate.js'
import { validateObjectId } from '../middleware/validateObjectId.js'
import {
  createEncounterSchema,
  addVitalsSchema,
  updateVitalsSchema,
  addDiagnosisSchema,
  updateDiagnosisSchema,
} from '../schemas/encounter.js'
import { createReferralSchema } from '../schemas/referral.js'
import { createPrescriptionSchema } from '../schemas/prescription.js'
import * as ctrl from '../controllers/encounter.controller.js'

const router = Router()

// Mounted at /api/v1/encounters in routes/index.ts.

/**
 * @openapi
 * /encounters:
 *   post:
 *     summary: Open a new clinical encounter
 *     tags: [Encounters]
 *     description: >
 *       Nurse only. A nurse isn't assigned to a specific doctor, so they must
 *       supply `appointment`. The encounter then takes on whichever doctor
 *       that appointment was already booked with. Afterward, the referenced
 *       Appointment's `encounter` field is set to point at this new
 *       encounter's id.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [patient, appointment, chiefComplaint]
 *             properties:
 *               patient: { type: string, description: Patient ObjectId }
 *               appointment: { type: string, description: Appointment ObjectId this encounter came from — always required }
 *               chiefComplaint: { type: string }
 *               history: { type: string }
 *     responses:
 *       201:
 *         description: Encounter created.
 *       422:
 *         description: Request omitted a required field, e.g. `appointment` (VALIDATION_ERROR).
 */
router.post('/', auth, requirePermission('encounter.create'), validate(createEncounterSchema), ctrl.create)

/**
 * @openapi
 * /encounters:
 *   get:
 *     summary: List encounters
 *     tags: [Encounters]
 *     description: Admin/Nurse see every encounter. Doctor sees only encounters where they are the assigned doctor.
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [IN_PROGRESS, COMPLETED] }
 *     responses:
 *       200:
 *         description: List of encounters, newest first.
 */
router.get('/', auth, requirePermission('encounter.read'), ctrl.list)

/**
 * @openapi
 * /encounters/ward-board:
 *   get:
 *     summary: A one-screen view of every open encounter with its latest acuity read
 *     tags: [Encounters]
 *     description: >
 *       Requires 'encounter.read', same role scoping as GET /encounters
 *       (Doctor sees only their own; Admin/Nurse see every open encounter).
 *       Registered ahead of GET /encounters/{id} so "ward-board" is never
 *       swallowed by the :id route.
 *     responses:
 *       200:
 *         description: Every IN_PROGRESS encounter, oldest-started first, with acuityLevel/acuityReasons/assessedAt when a nurse has run an AI vitals check on it.
 */
router.get('/ward-board', auth, requirePermission('encounter.read'), ctrl.wardBoard)

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
 * /encounters/{id}/vitals/{vitalId}:
 *   patch:
 *     summary: Correct a previously-recorded vitals entry
 *     tags: [Encounters]
 *     description: >
 *       Nurse only ('vitals.update'). Uses the same request shape as POST,
 *       and at least one measurement is required. This is blocked once the
 *       encounter is marked COMPLETED.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: vitalId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Updated vitals entry.
 *       404:
 *         description: Encounter or vitals entry not found.
 *       409:
 *         description: Encounter is already completed.
 */
router.patch(
  '/:id/vitals/:vitalId',
  auth,
  validateObjectId('id'),
  validateObjectId('vitalId'),
  requirePermission('vitals.update'),
  validate(updateVitalsSchema),
  ctrl.updateVitals,
)

/**
 * @openapi
 * /encounters/{id}/vitals/{vitalId}:
 *   delete:
 *     summary: Remove a vitals entry recorded in error
 *     tags: [Encounters]
 *     description: >
 *       Nurse only ('vitals.delete'). Not restricted to the nurse who
 *       recorded it. This is blocked once the encounter is marked COMPLETED.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: vitalId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Deleted vitals entry.
 *       404:
 *         description: Encounter or vitals entry not found.
 *       409:
 *         description: Encounter is already completed.
 */
router.delete(
  '/:id/vitals/:vitalId',
  auth,
  validateObjectId('id'),
  validateObjectId('vitalId'),
  requirePermission('vitals.delete'),
  ctrl.deleteVitals,
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

/**
 * @openapi
 * /encounters/{id}/diagnoses/{diagnosisId}:
 *   patch:
 *     summary: Correct a previously-added diagnosis
 *     tags: [Encounters]
 *     description: >
 *       Doctor only ('diagnosis.update'), and only the doctor who originally
 *       added the diagnosis can update it. A 404 response covers both cases:
 *       the diagnosis doesn't exist, or it belongs to a different doctor.
 *       This is blocked once the encounter is marked COMPLETED.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: diagnosisId
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
 *       200:
 *         description: Updated diagnosis.
 *       404:
 *         description: Encounter or diagnosis not found (or not yours).
 *       409:
 *         description: Encounter is already completed.
 */
router.patch(
  '/:id/diagnoses/:diagnosisId',
  auth,
  validateObjectId('id'),
  validateObjectId('diagnosisId'),
  requirePermission('diagnosis.update'),
  validate(updateDiagnosisSchema),
  ctrl.updateDiagnosis,
)

/**
 * @openapi
 * /encounters/{id}/diagnoses/{diagnosisId}:
 *   delete:
 *     summary: Remove a diagnosis entered in error
 *     tags: [Encounters]
 *     description: >
 *       Doctor only ('diagnosis.delete'), and only the doctor who originally
 *       added the diagnosis can delete it. A 404 response covers both cases:
 *       the diagnosis doesn't exist, or it belongs to a different doctor.
 *       This is blocked once the encounter is marked COMPLETED.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: diagnosisId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Deleted diagnosis.
 *       404:
 *         description: Encounter or diagnosis not found (or not yours).
 *       409:
 *         description: Encounter is already completed.
 */
router.delete(
  '/:id/diagnoses/:diagnosisId',
  auth,
  validateObjectId('id'),
  validateObjectId('diagnosisId'),
  requirePermission('diagnosis.delete'),
  ctrl.deleteDiagnosis,
)

/**
 * @openapi
 * /encounters/{id}/referrals:
 *   post:
 *     summary: Refer this encounter's patient to another doctor
 *     tags: [Encounters]
 *     description: >
 *       Doctor only ('referral.create'), and only the doctor assigned to
 *       this encounter can refer from it. The receiving doctor (`toDoctor`)
 *       is notified immediately. Blocked once the encounter is COMPLETED.
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
 *             required: [toDoctor, reason]
 *             properties:
 *               toDoctor: { type: string, description: The receiving doctor's User ObjectId }
 *               reason: { type: string }
 *               notes: { type: string }
 *     responses:
 *       201:
 *         description: Referral created.
 *       404:
 *         description: Encounter not found (or not assigned to the caller).
 *       409:
 *         description: Encounter is already completed.
 */
router.post(
  '/:id/referrals',
  auth,
  validateObjectId('id'),
  requirePermission('referral.create'),
  validate(createReferralSchema),
  ctrl.addReferral,
)

/**
 * @openapi
 * /encounters/{id}/prescriptions:
 *   post:
 *     summary: Write a prescription on this encounter's patient
 *     tags: [Encounters]
 *     description: >
 *       Doctor only ('prescription.create'), and only the doctor assigned
 *       to this encounter. Blocked once the encounter is COMPLETED.
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
 *             required: [medications]
 *             properties:
 *               medications:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [drugName, dosage, frequency, duration]
 *                   properties:
 *                     drugName: { type: string }
 *                     dosage: { type: string }
 *                     frequency: { type: string }
 *                     duration: { type: string }
 *                     instructions: { type: string }
 *     responses:
 *       201:
 *         description: Prescription created.
 *       404:
 *         description: Encounter not found (or not assigned to the caller).
 *       409:
 *         description: Encounter is already completed.
 */
router.post(
  '/:id/prescriptions',
  auth,
  validateObjectId('id'),
  requirePermission('prescription.create'),
  validate(createPrescriptionSchema),
  ctrl.addPrescription,
)

/**
 * @openapi
 * /encounters/{id}/complete:
 *   patch:
 *     summary: Close out an encounter
 *     tags: [Encounters]
 *     description: >
 *       Doctor only, and only the doctor assigned to this specific encounter
 *       can complete it. A 404 response covers both cases: the encounter
 *       doesn't exist, or it belongs to a different doctor.
 *       Once an encounter is marked COMPLETED, no more vitals, diagnoses, or
 *       lab orders can be added to it. There's no requirement that vitals or
 *       a diagnosis already exist before completing it — appointment status
 *       works the same way, with no fixed sequence of steps enforced.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Completed encounter.
 *       404:
 *         description: Encounter not found (or not assigned to the caller).
 *       409:
 *         description: This encounter is already completed.
 */
router.patch(
  '/:id/complete',
  auth,
  validateObjectId('id'),
  requirePermission('encounter.complete'),
  ctrl.complete,
)

export default router
