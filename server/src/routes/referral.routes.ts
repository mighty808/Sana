import { Router } from 'express'
import { auth } from '../middleware/auth.js'
import { requirePermission } from '../middleware/rbac.js'
import { validate } from '../middleware/validate.js'
import { validateObjectId } from '../middleware/validateObjectId.js'
import { updateReferralStatusSchema, sendReferralMessageSchema } from '../schemas/referral.js'
import * as ctrl from '../controllers/referral.controller.js'

const router = Router()

// Mounted at /api/v1/referrals in routes/index.ts. Creating a referral is
// POST /encounters/:id/referrals instead (see encounter.routes.ts) — it's
// scoped to the encounter it came from, the same way diagnoses are. This
// router only covers what's genuinely cross-encounter: a doctor's own
// incoming worklist, and acting on one of those referrals.

/**
 * @openapi
 * /referrals:
 *   get:
 *     summary: List referrals sent to the current doctor
 *     tags: [Referrals]
 *     responses:
 *       200:
 *         description: The caller's incoming referrals, newest first.
 */
router.get('/', auth, requirePermission('referral.read'), ctrl.listMine)

/**
 * @openapi
 * /referrals/sent:
 *   get:
 *     summary: List referrals the current doctor has sent
 *     tags: [Referrals]
 *     description: >
 *       The mirror of GET /referrals — what this doctor referred out, rather
 *       than what was referred to them. Doctor only ('referral.read').
 *     responses:
 *       200:
 *         description: The caller's outgoing referrals, newest first.
 */
// Declared ahead of the /:id routes below so a literal "sent" is never matched
// as an id. There's no GET /:id today, but the ordering shouldn't depend on
// that staying true.
router.get('/sent', auth, requirePermission('referral.read'), ctrl.listSent)

/**
 * @openapi
 * /referrals/{id}/status:
 *   patch:
 *     summary: Acknowledge or complete a referral sent to you
 *     tags: [Referrals]
 *     description: >
 *       Doctor only ('referral.update'), and only the doctor the referral
 *       was sent to. A 404 covers both "doesn't exist" and "not yours."
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
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [PENDING, ACKNOWLEDGED, COMPLETED] }
 *     responses:
 *       200:
 *         description: Updated referral.
 *       404:
 *         description: Referral not found (or not yours).
 */
router.patch(
  '/:id/status',
  auth,
  validateObjectId('id'),
  requirePermission('referral.update'),
  validate(updateReferralStatusSchema),
  ctrl.updateStatus,
)

/**
 * @openapi
 * /referrals/{id}/messages:
 *   get:
 *     summary: List the message thread on a referral
 *     tags: [Referrals]
 *     description: >
 *       Doctor only ('referral.read'), and only the referral's own
 *       fromDoctor/toDoctor. A 404 covers both "doesn't exist" and "not
 *       yours" — see referral.service.ts's assertReferralParticipant.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Messages on this referral, oldest first.
 *       404:
 *         description: Referral not found (or not yours).
 *   post:
 *     summary: Send a message on a referral
 *     tags: [Referrals]
 *     description: >
 *       Doctor only ('referral.read' — sending a message doesn't change the
 *       referral's status, so this doesn't require 'referral.update'), and
 *       only the referral's own fromDoctor/toDoctor. Notifies the other
 *       doctor on the referral.
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
 *             required: [body]
 *             properties:
 *               body: { type: string, maxLength: 2000 }
 *     responses:
 *       201:
 *         description: The created message.
 *       404:
 *         description: Referral not found (or not yours).
 */
router.get('/:id/messages', auth, validateObjectId('id'), requirePermission('referral.read'), ctrl.listMessages)

router.post(
  '/:id/messages',
  auth,
  validateObjectId('id'),
  requirePermission('referral.read'),
  validate(sendReferralMessageSchema),
  ctrl.sendMessage,
)

export default router
