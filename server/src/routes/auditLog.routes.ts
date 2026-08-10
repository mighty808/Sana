import { Router } from 'express'
import { auth } from '../middleware/auth.js'
import { requirePermission } from '../middleware/rbac.js'
import * as ctrl from '../controllers/auditLog.controller.js'

const router = Router()

// Mounted at /api/v1/audit-logs in routes/index.ts.

/**
 * @openapi
 * /audit-logs:
 *   get:
 *     summary: View the audit trail (admin only)
 *     tags: [Analytics]
 *     parameters:
 *       - in: query
 *         name: action
 *         schema: { type: string }
 *         description: e.g. LOGIN_SUCCESS, PATIENT_REGISTERED, LAB_RESULT_RELEASED
 *       - in: query
 *         name: resource
 *         schema: { type: string }
 *         description: e.g. User, Patient, Invoice
 *       - in: query
 *         name: user
 *         schema: { type: string }
 *         description: Filter to entries performed by this user id.
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50 }
 *     responses:
 *       200:
 *         description: Paginated audit log entries, newest first.
 */
router.get('/', auth, requirePermission('auditlog.read'), ctrl.list)

export default router
