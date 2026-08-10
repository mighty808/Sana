import { Router } from 'express'
import { auth } from '../middleware/auth.js'
import { requirePermission } from '../middleware/rbac.js'
import { validateObjectId } from '../middleware/validateObjectId.js'
import * as ctrl from '../controllers/notification.controller.js'

const router = Router()

// Mounted at /api/v1/notifications in routes/index.ts.
// Every role holds 'notification.read' by default (see types/permissions.ts)
// — the permission just gates "logged in at all," since the service layer
// always scopes results to the caller's own notifications regardless of role.

/**
 * @openapi
 * /notifications:
 *   get:
 *     summary: List my notifications (newest first)
 *     tags: [Notifications]
 *     responses:
 *       200:
 *         description: Up to the 100 most recent notifications for the current user.
 */
router.get('/', auth, requirePermission('notification.read'), ctrl.list)

/**
 * @openapi
 * /notifications/{id}/read:
 *   patch:
 *     summary: Mark one of my notifications as read
 *     tags: [Notifications]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: The notification, now marked read.
 *       404:
 *         description: Notification not found (or belongs to someone else).
 */
router.patch('/:id/read', auth, validateObjectId('id'), requirePermission('notification.read'), ctrl.markAsRead)

export default router
