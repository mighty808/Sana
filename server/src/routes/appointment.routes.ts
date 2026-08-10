import { Router } from 'express'
import { auth } from '../middleware/auth.js'
import { requirePermission } from '../middleware/rbac.js'
import { validate } from '../middleware/validate.js'
import { validateObjectId } from '../middleware/validateObjectId.js'
import { createAppointmentSchema, updateAppointmentStatusSchema } from '../schemas/appointment.js'
import * as ctrl from '../controllers/appointment.controller.js'

const router = Router()

// Mounted at /api/v1/appointments in routes/index.ts.

/**
 * @openapi
 * /appointments:
 *   post:
 *     summary: Book a new appointment
 *     tags: [Appointments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [patient, doctor, department, date, startTime, endTime]
 *             properties:
 *               patient: { type: string, description: Patient ObjectId }
 *               doctor: { type: string, description: User ObjectId (must have the DOCTOR role) }
 *               department: { type: string, description: Department ObjectId }
 *               date: { type: string, format: date }
 *               startTime: { type: string, example: "09:00" }
 *               endTime: { type: string, example: "09:30" }
 *               reason: { type: string }
 *     responses:
 *       201:
 *         description: Appointment created, with generated appointmentNumber (e.g. APT-2026-00001).
 *   get:
 *     summary: List appointments (filtered by the caller's role)
 *     tags: [Appointments]
 *     description: >
 *       Admin/Nurse see every appointment. Doctor sees only their own.
 *       Patient sees only appointments tied to their own linked Patient record.
 *     responses:
 *       200:
 *         description: List of appointments.
 */
router.post('/', auth, requirePermission('appointment.create'), validate(createAppointmentSchema), ctrl.create)
router.get('/', auth, requirePermission('appointment.read'), ctrl.list)

/**
 * @openapi
 * /appointments/{id}/status:
 *   patch:
 *     summary: Update an appointment's status
 *     tags: [Appointments]
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
 *               status:
 *                 type: string
 *                 enum: [BOOKED, CONFIRMED, CHECKED_IN, IN_PROGRESS, COMPLETED, CANCELLED, NO_SHOW]
 *     responses:
 *       200:
 *         description: Updated appointment.
 *       404:
 *         description: Appointment not found.
 */
router.patch(
  '/:id/status',
  auth,
  validateObjectId('id'),
  requirePermission('appointment.update'),
  validate(updateAppointmentStatusSchema),
  ctrl.updateStatus,
)

export default router
