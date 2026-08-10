import { z } from 'zod'
import { APPOINTMENT_STATUSES } from '../models/Appointment.js'

// Matches "HH:MM" 24-hour time, e.g. "09:00" or "14:30".
const timeString = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:MM 24-hour time')

// Validates POST /appointments request bodies (booking a new appointment).
export const createAppointmentSchema = z.object({
  patient: z.string().min(1), // Patient ObjectId — existence checked in the service layer
  doctor: z.string().min(1), // User (Doctor) ObjectId
  department: z.string().min(1), // Department ObjectId
  date: z.coerce.date(),
  startTime: timeString,
  endTime: timeString,
  reason: z.string().trim().optional(),
})

// Validates PATCH /appointments/:id/status request bodies.
export const updateAppointmentStatusSchema = z.object({
  status: z.enum(APPOINTMENT_STATUSES),
})
