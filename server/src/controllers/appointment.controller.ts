import type { Request, Response } from 'express'
import * as appointmentService from '../services/appointment.service.js'
import * as auditService from '../services/audit.service.js'
import { ok } from '../utils/apiResponse.js'
import type { AppointmentStatus } from '../models/Appointment.js'

// POST /appointments — requires 'appointment.create' (Admin, per the
// default role permissions — see types/permissions.ts).
export async function create(req: Request, res: Response) {
  const appointment = await appointmentService.createAppointment(req.body)
  await auditService.logAction(req, req.user!.id, 'APPOINTMENT_BOOKED', 'Appointment', appointment.id, {
    appointmentNumber: appointment.appointmentNumber,
  })
  return ok(res, appointment, 201)
}

// GET /appointments — requires 'appointment.read'. Every role holds this
// permission by default; listAppointments() itself narrows the results
// based on the caller's role (see the detailed comment there).
export async function list(req: Request, res: Response) {
  const appointments = await appointmentService.listAppointments(req.user!)
  return ok(res, appointments)
}

// PATCH /appointments/:id/status — requires 'appointment.update'.
// req.user! is passed through so the service can restrict a DOCTOR caller
// to only updating their own assigned appointments (see the ownership note
// on updateAppointmentStatus in appointment.service.ts).
export async function updateStatus(req: Request, res: Response) {
  const appointment = await appointmentService.updateAppointmentStatus(
    req.params.id as string,
    req.body.status as AppointmentStatus,
    req.user!,
  )
  await auditService.logAction(req, req.user!.id, 'APPOINTMENT_STATUS_UPDATED', 'Appointment', appointment.id, {
    status: appointment.status,
  })
  return ok(res, appointment)
}
