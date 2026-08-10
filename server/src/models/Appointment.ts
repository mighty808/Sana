import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose'

// The lifecycle an appointment moves through. BOOKED is the starting state
// (Admin/receptionist scheduled it); CONFIRMED/CHECKED_IN/IN_PROGRESS track
// the patient actually arriving and being seen; COMPLETED/CANCELLED/NO_SHOW
// are the three terminal states. See blueprint section 5.1 for this exact list.
export const APPOINTMENT_STATUSES = [
  'BOOKED',
  'CONFIRMED',
  'CHECKED_IN',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
] as const
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number]

// A booked visit between a Patient and a Doctor. This is what shows up on
// a doctor's dashboard and is what a Nurse/Doctor eventually turns into an
// Encounter (the actual clinical record of the visit — see Encounter.ts).
const appointmentSchema = new Schema(
  {
    // Human-readable, sequential id like "APT-2026-00421" (see utils/generateId.ts).
    appointmentNumber: { type: String, required: true, unique: true },
    patient: { type: Schema.Types.ObjectId, ref: 'Patient', required: true },
    doctor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    department: { type: Schema.Types.ObjectId, ref: 'Department', required: true },
    // The calendar day of the appointment (time-of-day lives in startTime/endTime
    // below, as plain "HH:MM" strings — simpler than juggling timezones across
    // two separate Date fields for what's really just a wall-clock time slot).
    date: { type: Date, required: true },
    startTime: { type: String, required: true }, // "HH:MM", 24-hour
    endTime: { type: String, required: true }, // "HH:MM", 24-hour
    reason: { type: String, trim: true },
    status: { type: String, enum: APPOINTMENT_STATUSES, default: 'BOOKED' },
  },
  { timestamps: true },
)

// Speeds up the most common queries: a doctor's schedule for a given day,
// and a patient's appointment history.
appointmentSchema.index({ doctor: 1, date: 1 })
appointmentSchema.index({ patient: 1, date: -1 })

export type AppointmentAttrs = InferSchemaType<typeof appointmentSchema>
export type AppointmentDoc = HydratedDocument<AppointmentAttrs>
export const Appointment = model<AppointmentAttrs>('Appointment', appointmentSchema)
