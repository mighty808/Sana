import { Router } from 'express'
import { auth } from '../middleware/auth.js'
import { requirePermission, requireAnyPermission } from '../middleware/rbac.js'
import { validate } from '../middleware/validate.js'
import { validateObjectId } from '../middleware/validateObjectId.js'
import { aiRateLimiter } from '../middleware/rateLimiter.js'
import {
  consultAiSchema,
  reviewAiConsultationSchema,
  analyzeVitalsSchema,
  explainLabResultSchema,
  differentialDiagnosisSchema,
} from '../schemas/ai.js'
import * as ctrl from '../controllers/ai.controller.js'

const router = Router()

// Mounted at /api/v1/ai in routes/index.ts.
// Every route here requires 'ai.consult' or 'ai.review', both of which only
// the Doctor role has by default (see types/permissions.ts). Only doctors
// query Sana AI during a consultation.

/**
 * @openapi
 * /ai/consult:
 *   post:
 *     summary: Query Sana AI during an encounter
 *     tags: [Sana AI]
 *     description: >
 *       Only anonymized context is sent to the AI service (chief complaint,
 *       latest vitals, doctor-entered symptoms). The patient's name, id, and
 *       phone number are never sent.
 *       If the AI service can't be reached, this returns a 503 error instead
 *       of crashing, so the rest of the hospital system keeps working normally
 *       (see ai.service.ts for how it handles that case).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [encounter, query]
 *             properties:
 *               encounter: { type: string, description: Encounter ObjectId }
 *               query: { type: string, maxLength: 2000 }
 *               symptoms:
 *                 type: array
 *                 items: { type: string }
 *     responses:
 *       201:
 *         description: AI consultation created, with the RAG pipeline's response.
 *       503:
 *         description: Sana AI is currently unavailable.
 */
router.post('/consult', auth, aiRateLimiter, requirePermission('ai.consult'), validate(consultAiSchema), ctrl.consult)

/**
 * @openapi
 * /ai/consultations:
 *   get:
 *     summary: List AI consultations for an encounter
 *     tags: [Sana AI]
 *     parameters:
 *       - in: query
 *         name: encounter
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: >
 *           List of AI consultations for that encounter, oldest first. A
 *           doctor (ai.consult) sees every consultation on the encounter; a
 *           nurse (ai.analyzeVitals) sees only their own vitals-analysis
 *           consultations — the controller scopes the result by which of
 *           the two permissions the caller actually has.
 */
router.get(
  '/consultations',
  auth,
  requireAnyPermission('ai.consult', 'ai.analyzeVitals'),
  ctrl.listForEncounter,
)

/**
 * @openapi
 * /ai/consultations/{id}/review:
 *   post:
 *     summary: Record the doctor's review of an AI response
 *     tags: [Sana AI]
 *     description: >
 *       This is where a human checks the AI's answer, since the AI never
 *       writes to the clinical record itself. Only the doctor who asked the
 *       original question can do this.
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
 *             required: [reviewStatus]
 *             properties:
 *               reviewStatus: { type: string, enum: [ACCEPTED, PARTIALLY_ACCEPTED, IGNORED] }
 *               doctorComment: { type: string, maxLength: 2000 }
 *     responses:
 *       200:
 *         description: Updated consultation.
 *       404:
 *         description: Consultation not found (or belongs to a different doctor).
 */
router.post(
  '/consultations/:id/review',
  auth,
  validateObjectId('id'),
  requirePermission('ai.review'),
  validate(reviewAiConsultationSchema),
  ctrl.review,
)

/**
 * @openapi
 * /ai/analyze-vitals:
 *   post:
 *     summary: Nurse-only fixed-question AI analysis of an encounter's vitals
 *     tags: [Sana AI]
 *     description: >
 *       Uses the same anonymized-data AI pipeline as /ai/consult, but instead
 *       of a free-text question, it asks a fixed question about the vitals
 *       and chief complaint that were just recorded. Requires the
 *       'ai.analyzeVitals' permission, not 'ai.consult'.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [encounter]
 *             properties:
 *               encounter: { type: string, description: Encounter ObjectId }
 *               notes: { type: string, maxLength: 1000 }
 *     responses:
 *       201:
 *         description: AI consultation created, with the RAG pipeline's response.
 *       503:
 *         description: Sana AI is currently unavailable.
 */
router.post(
  '/analyze-vitals',
  auth,
  aiRateLimiter,
  requirePermission('ai.analyzeVitals'),
  validate(analyzeVitalsSchema),
  ctrl.analyzeVitals,
)

/**
 * @openapi
 * /ai/differential-diagnosis:
 *   post:
 *     summary: Doctor-only fixed-question AI differential-diagnosis suggestion
 *     tags: [Sana AI]
 *     description: >
 *       Uses the same anonymized-data AI pipeline as /ai/consult, but instead
 *       of a free-text question, it asks a fixed question and also sends the
 *       encounter's lab results alongside the chief complaint and vitals.
 *       Returns a ranked list of candidate diagnoses with confidence and
 *       reasoning — Sana AI never writes these into the Diagnosis collection
 *       itself; the doctor still adds one by hand if it's useful. Requires
 *       'ai.consult', same as /ai/consult.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [encounter]
 *             properties:
 *               encounter: { type: string, description: Encounter ObjectId }
 *               notes: { type: string, maxLength: 1000 }
 *     responses:
 *       201:
 *         description: AI consultation created, with the RAG pipeline's response.
 *       503:
 *         description: Sana AI is currently unavailable.
 */
router.post(
  '/differential-diagnosis',
  auth,
  aiRateLimiter,
  requirePermission('ai.consult'),
  validate(differentialDiagnosisSchema),
  ctrl.suggestDifferentialDiagnosis,
)

/**
 * @openapi
 * /ai/explain-lab-result:
 *   post:
 *     summary: Lab Tech-only fixed-question AI explanation of one test result
 *     tags: [Sana AI]
 *     description: >
 *       Sends only the result's own fields to the AI service (test name,
 *       value, unit, reference range, interpretation). The patient's name is
 *       never sent. Requires the 'ai.explainLabResult' permission, not
 *       'ai.consult'.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [labResult]
 *             properties:
 *               labResult: { type: string, description: LabResult ObjectId }
 *               notes: { type: string, maxLength: 1000 }
 *     responses:
 *       201:
 *         description: AI consultation created, with the RAG pipeline's response.
 *       503:
 *         description: Sana AI is currently unavailable.
 */
router.post(
  '/explain-lab-result',
  auth,
  aiRateLimiter,
  requirePermission('ai.explainLabResult'),
  validate(explainLabResultSchema),
  ctrl.explainLabResult,
)

/**
 * @openapi
 * /ai/consultations/lab-order/{labOrder}:
 *   get:
 *     summary: List past AI explanations for every result on one lab order
 *     tags: [Sana AI]
 *     description: >
 *       Returns every result's explanations for one order in a single call,
 *       instead of making the client send one GET request per result.
 *     parameters:
 *       - in: path
 *         name: labOrder
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: List of AI consultations across that order's results, oldest first.
 */
router.get(
  '/consultations/lab-order/:labOrder',
  auth,
  requirePermission('ai.explainLabResult'),
  ctrl.listForLabOrder,
)

export default router
