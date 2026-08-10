import { Router } from 'express'
import authRoutes from './auth.routes.js'
import userRoutes from './user.routes.js'
import patientRoutes from './patient.routes.js'
import departmentRoutes from './department.routes.js'
import appointmentRoutes from './appointment.routes.js'
import encounterRoutes from './encounter.routes.js'
import labOrderRoutes from './labOrder.routes.js'
import labResultRoutes from './labResult.routes.js'
import notificationRoutes from './notification.routes.js'
import invoiceRoutes from './invoice.routes.js'
import paymentRoutes from './payment.routes.js'
import aiRoutes from './ai.routes.js'
import analyticsRoutes from './analytics.routes.js'
import auditLogRoutes from './auditLog.routes.js'

// This is the single top-level router for the whole API. app.ts mounts it
// at /api/v1, so every path below becomes /api/v1/<path>. Each feature module
// gets its own file (auth.routes.ts, user.routes.ts, ...) and is attached
// here with router.use() as that phase of the build is completed.
const router = Router()

// Simple liveness check — used to verify the server process is up and
// responding, without touching the database. Handy for uptime checks.
router.get('/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok', timestamp: new Date().toISOString() } })
})

router.use('/auth', authRoutes)
router.use('/users', userRoutes)
router.use('/patients', patientRoutes)
router.use('/departments', departmentRoutes)
router.use('/appointments', appointmentRoutes)
router.use('/encounters', encounterRoutes)
router.use('/lab-orders', labOrderRoutes)
router.use('/lab-results', labResultRoutes)
router.use('/notifications', notificationRoutes)
router.use('/invoices', invoiceRoutes)
router.use('/payments', paymentRoutes)
router.use('/ai', aiRoutes)
router.use('/analytics', analyticsRoutes)
router.use('/audit-logs', auditLogRoutes)

export default router
