import { Router } from 'express'
import { auth } from '../middleware/auth.js'
import { requirePermission } from '../middleware/rbac.js'
import { validate } from '../middleware/validate.js'
import { validateObjectId } from '../middleware/validateObjectId.js'
import { aiRateLimiter } from '../middleware/rateLimiter.js'
import { consultAiSchema, reviewAiConsultationSchema } from '../schemas/ai.js'
import * as ctrl from '../controllers/ai.controller.js'

const router = Router()

// Mounted at /api/v1/ai in routes/index.ts.
// Every route here requires 'ai.consult' or 'ai.review' — both Doctor-only
// (see types/permissions.ts), matching the blueprint's role table: only
// doctors query MediAssist AI during a consultation.

/**
 * @openapi
 * /ai/consult:
 *   post:
 *     summary: Query MediAssist AI during an encounter
 *     tags: [MediAssist AI]
 *     description: >
 *       Only anonymized context (chief complaint, latest vitals, doctor-entered
 *       symptoms) is sent to the AI service — never patient name, id, or phone.
 *       If the AI service is unreachable, returns 503 so the rest of the
 *       hospital system is unaffected (see ai.service.ts's graceful degradation).
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
 *         description: MediAssist AI is currently unavailable.
 */
router.post('/consult', auth, aiRateLimiter, requirePermission('ai.consult'), validate(consultAiSchema), ctrl.consult)

/**
 * @openapi
 * /ai/consultations:
 *   get:
 *     summary: List AI consultations for an encounter
 *     tags: [MediAssist AI]
 *     parameters:
 *       - in: query
 *         name: encounter
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: List of AI consultations for that encounter, oldest first.
 */
router.get('/consultations', auth, requirePermission('ai.consult'), ctrl.listForEncounter)

/**
 * @openapi
 * /ai/consultations/{id}/review:
 *   post:
 *     summary: Record the doctor's review of an AI response
 *     tags: [MediAssist AI]
 *     description: >
 *       The human-oversight step — the AI never writes to the clinical record
 *       itself. Restricted to the same doctor who asked the question.
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

export default router
