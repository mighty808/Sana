import { Router } from 'express'

const router = Router()

router.get('/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok', timestamp: new Date().toISOString() } })
})

// Route modules are mounted here as each phase lands:
// router.use('/auth', authRoutes)
// router.use('/users', userRoutes)
// router.use('/patients', patientRoutes)
// router.use('/appointments', appointmentRoutes)
// router.use('/encounters', encounterRoutes)
// router.use('/lab-orders', labOrderRoutes)
// router.use('/lab-results', labResultRoutes)
// router.use('/ai', aiRoutes)
// router.use('/invoices', invoiceRoutes)
// router.use('/payments', paymentRoutes)
// router.use('/notifications', notificationRoutes)
// router.use('/analytics', analyticsRoutes)
// router.use('/audit-logs', auditLogRoutes)

export default router
