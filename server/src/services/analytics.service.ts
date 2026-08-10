import { Patient } from '../models/Patient.js'
import { User } from '../models/User.js'
import { Role } from '../models/Role.js'
import { Appointment } from '../models/Appointment.js'
import { Encounter } from '../models/Encounter.js'
import { LabOrder } from '../models/LabOrder.js'
import { AiConsultation } from '../models/AiConsultation.js'
import { VitalSign } from '../models/VitalSign.js'
import { Notification } from '../models/Notification.js'
import { AppError } from '../utils/apiResponse.js'
import type { AuthedUser } from '../types/user.js'
import { getPatientForUser } from './patient.service.js'
import { sumOutstandingBalance } from './invoice.service.js'

// Returns the [start, end) boundaries of "today" in local server time —
// used everywhere this file needs to count "today's appointments" etc.
// MVP-simple: no timezone handling beyond the server's own clock, which is
// fine for a single-hospital deployment (matches how the rest of the
// codebase treats dates — e.g. appointment.service.ts's double-booking
// check also compares Date values directly with no timezone conversion).
function todayRange() {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { start, end }
}

// ADMIN dashboard: system-wide counts an administrator needs at a glance —
// how many patients are registered, how the day's appointments are moving,
// how much lab work is outstanding, how much billing is unpaid, and how
// many STAFF accounts exist. Every number here is a simple count/sum —
// deliberately not pre-aggregating into chart-ready buckets (e.g. a 7-day
// trend) since nothing in the blueprint's endpoint table asks for that
// level of detail, and the frontend (built in a later pass) can shape
// these raw numbers into whatever Recharts visualization it needs.
async function getAdminDashboard() {
  const { start, end } = todayRange()

  // "Staff" means every role except PATIENT — the User collection holds
  // one login account per role (admin/doctor/nurse/patient all included),
  // so counting ALL active users would report thousands of patient login
  // accounts as "users," not the handful of actual hospital staff this
  // number is meant to represent.
  const staffRoleIds = await Role.find({ name: { $ne: 'PATIENT' } }).distinct('_id')

  const [totalPatients, totalStaffUsers, appointmentsToday, pendingLabOrders, outstandingBalance] =
    await Promise.all([
      Patient.countDocuments({ status: 'ACTIVE' }),
      User.countDocuments({ status: 'ACTIVE', role: { $in: staffRoleIds } }),
      Appointment.countDocuments({ date: { $gte: start, $lt: end } }),
      LabOrder.countDocuments({ status: { $in: ['ORDERED', 'PROCESSING'] } }),
      sumOutstandingBalance(),
    ])

  return { totalPatients, totalStaffUsers, appointmentsToday, pendingLabOrders, outstandingBalance }
}

// DOCTOR dashboard: this doctor's own workload — how many distinct
// patients they've seen, today's appointment count, lab orders they
// placed whose results are in but not yet reviewed, and how many AI
// consultations they've asked for that they haven't reviewed yet (both
// are "things awaiting your attention" counters).
async function getDoctorDashboard(doctorId: string) {
  const { start, end } = todayRange()

  const [myPatientIds, appointmentsToday, labOrdersAwaitingReview, aiConsultationsUnreviewed] =
    await Promise.all([
      Appointment.distinct('patient', { doctor: doctorId }),
      Appointment.countDocuments({ doctor: doctorId, date: { $gte: start, $lt: end } }),
      // COMPLETED means every test has a result, but the order hasn't been
      // marked REVIEWED — see models/LabOrder.ts's status lifecycle comment.
      LabOrder.countDocuments({ doctor: doctorId, status: 'COMPLETED' }),
      AiConsultation.countDocuments({ doctor: doctorId, reviewStatus: 'UNREVIEWED' }),
    ])

  return {
    myPatients: myPatientIds.length,
    appointmentsToday,
    labOrdersAwaitingReview,
    aiConsultationsUnreviewed,
  }
}

// NURSE dashboard: there's no ward/bed model in this MVP (explicitly future
// work — see blueprint section 1.2), so "nurse's ward" is interpreted as
// "what's happening today that needs a nurse's attention": today's
// appointments, encounters currently in progress, and how many vitals this
// specific nurse has already recorded today (a simple productivity/recency signal).
async function getNurseDashboard(nurseId: string) {
  const { start, end } = todayRange()

  const [appointmentsToday, encountersInProgress, vitalsRecordedToday] = await Promise.all([
    Appointment.countDocuments({ date: { $gte: start, $lt: end } }),
    Encounter.countDocuments({ status: 'IN_PROGRESS' }),
    VitalSign.countDocuments({ recordedBy: nurseId, recordedAt: { $gte: start, $lt: end } }),
  ])

  return { appointmentsToday, encountersInProgress, vitalsRecordedToday }
}

// PATIENT dashboard: a personal summary — how many appointments they still
// have coming up, how many notifications they haven't read, and what they
// currently owe across all their invoices combined.
async function getPatientDashboard(userId: string) {
  const patient = await getPatientForUser(userId)
  if (!patient) {
    return { upcomingAppointments: 0, unreadNotifications: 0, outstandingBalance: 0 }
  }

  const { start } = todayRange()

  const [upcomingAppointments, unreadNotifications, outstandingBalance] = await Promise.all([
    Appointment.countDocuments({
      patient: patient.id,
      // Compared against the START of today, not the current instant —
      // Appointment.date stores only the calendar day (no time-of-day
      // component; see appointment.service.ts's exact-equality
      // double-booking check, which relies on that), so comparing against
      // `new Date()` (the current moment) would wrongly exclude today's
      // own appointment for the entire day until midnight rolled it out of
      // range on its own — e.g. a 5pm appointment would vanish from
      // "upcoming" as soon as the clock passed 12:00am, hours before it
      // actually happened.
      date: { $gte: start },
      status: { $nin: ['CANCELLED', 'NO_SHOW', 'COMPLETED'] },
    }),
    Notification.countDocuments({ user: userId, readAt: { $exists: false } }),
    sumOutstandingBalance({ patient: patient._id }),
  ])

  return { upcomingAppointments, unreadNotifications, outstandingBalance }
}

// Single entry point GET /analytics/dashboard calls — branches on the
// caller's role and returns that role's own shape of summary data. One
// endpoint instead of four separate routes, matching the blueprint's REST
// table (which lists just one generic `GET /analytics/dashboard`), the
// same "one endpoint, role-branched response" pattern already used for
// GET /appointments and GET /lab-orders.
export async function getDashboard(user: AuthedUser) {
  switch (user.role.name) {
    case 'ADMIN':
      return { role: 'ADMIN', ...(await getAdminDashboard()) }
    case 'DOCTOR':
      return { role: 'DOCTOR', ...(await getDoctorDashboard(user.id)) }
    case 'NURSE':
      return { role: 'NURSE', ...(await getNurseDashboard(user.id)) }
    case 'PATIENT':
      return { role: 'PATIENT', ...(await getPatientDashboard(user.id)) }
    default:
      // Should be unreachable — Role.name is DB-enum-restricted to the 4
      // known roles (see types/permissions.ts's ROLE_NAMES) — but an
      // explicit throw here means a future drift (a role renamed/added
      // without updating this switch) surfaces as a loud 500 instead of
      // silently returning `undefined`, which would otherwise make
      // ok(res, undefined) drop the `data` key and send the client a
      // bare `{success:true}` with no error signal at all.
      throw new AppError(`No dashboard defined for role '${user.role.name}'`, 500, 'UNKNOWN_ROLE')
  }
}
