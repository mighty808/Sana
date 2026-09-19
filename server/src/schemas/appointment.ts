import { z } from 'zod'
import { APPOINTMENT_STATUSES } from '../models/Appointment.js'

// Matches "HH:MM" 24-hour time, e.g. "09:00" or "14:30".
const timeString = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:MM 24-hour time')

// Validates POST /appointments request bodies (booking a new appointment).
// The `doctor` field is required here because it's a Nurse who creates
// appointments, not the doctor themselves, so there's no doctor identity to
// fill this in automatically. The nurse picks a doctor from a list (via
// GET /users/doctors), and that choice is checked for real in
// appointment.service.ts's createAppointment.
export const createAppointmentSchema = z
  .object({
    patient: z.string().min(1), // Patient ObjectId — existence checked in the service layer
    doctor: z.string().min(1), // Doctor's User ObjectId — validated (exists, ACTIVE, role DOCTOR) in the service layer
    date: z.coerce.date(),
    startTime: timeString,
    endTime: timeString,
    reason: z.string().trim().optional(),
  })
  // Because these times are always written as zero-padded 24-hour "HH:MM"
  // strings, comparing them as plain text ("09:00" < "14:30") gives the same
  // answer as comparing them as actual times. That means there's no need to
  // parse them into real Date/time objects just to check the order.
  .refine((data) => data.startTime < data.endTime, {
    message: 'startTime must be before endTime',
    path: ['endTime'],
  })

// Validates PATCH /appointments/:id/status request bodies.
export const updateAppointmentStatusSchema = z.object({
  status: z.enum(APPOINTMENT_STATUSES),
})
