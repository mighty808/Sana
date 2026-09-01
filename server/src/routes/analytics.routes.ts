import { Router } from 'express'
import { auth } from '../middleware/auth.js'
import { requirePermission } from '../middleware/rbac.js'
import * as ctrl from '../controllers/analytics.controller.js'

const router = Router()

// Mounted at /api/v1/analytics in routes/index.ts.

/**
 * @openapi
 * /analytics/dashboard:
 *   get:
 *     summary: Get a role-appropriate dashboard summary for the current user
 *     tags: [Analytics]
 *     description: >
 *       Response shape depends on the caller's role: Admin gets system-wide
 *       counts, Doctor gets their own workload, Nurse gets today's activity,
 *       Patient gets their own upcoming appointments/notifications/balance,
 *       Lab Technician gets the lab queue's outstanding/awaiting-release counts.
 *     responses:
 *       200:
 *         description: Dashboard summary for the caller's role.
 */
router.get('/dashboard', auth, requirePermission('analytics.read'), ctrl.dashboard)

export default router
