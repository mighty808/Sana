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

/**
 * @openapi
 * /analytics/trends:
 *   get:
 *     summary: Hospital-wide trend charts (Admin only)
 *     tags: [Analytics]
 *     description: >
 *       30-day appointment volume, 30-day revenue, 30-day appointment outcome
 *       breakdown, and 8-week lab turnaround time — real time-series data
 *       meant to be charted, unlike the single-number /dashboard summary above.
 *     responses:
 *       200:
 *         description: Trend data for the Analytics page.
 */
router.get('/trends', auth, requirePermission('analytics.readTrends'), ctrl.trends)

export default router
