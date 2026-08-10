import { Patient } from '../models/Patient.js'
import { User } from '../models/User.js'
import { Appointment } from '../models/Appointment.js'
import { Encounter } from '../models/Encounter.js'
import { LabOrder } from '../models/LabOrder.js'
import { Invoice } from '../models/Invoice.js'
import { AiConsultation } from '../models/AiConsultation.js'
import { VitalSign } from '../models/VitalSign.js'
import { Notification } from '../models/Notification.js'
import type { AuthedUser } from '../types/user.js'
import { getPatientForUser } from './patient.service.js'

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
// many staff accounts exist. Every number here is a simple count/sum —
// deliberately not pre-aggregating into chart-ready buckets (e.g. a 7-day
// trend) since nothing in the blueprint's endpoint table asks for that
// level of detail, and the frontend (built in a later pass) can shape
// these raw numbers into whatever Recharts visualization it needs.
async function getAdminDashboard() {
  const { start, end } = todayRange()

  const [
    totalPatients,
    totalUsers,
    appointmentsToday,
    pendingLabOrders,
    outstandingInvoices,
  ] = await Promise.all([
    Patient.countDocuments({ status: 'ACTIVE' }),
    User.countDocuments({ status: 'ACTIVE' }),
    Appointment.countDocuments({ date: { $gte: start, $lt: end } }),
    LabOrder.countDocuments({ status: { $in: ['ORDERED', 'PROCESSING'] } }),
    // Sum of `balance` across every invoice that isn't fully settled or
    // voided — the single "money still owed to the hospital" figure.
    Invoice.aggregate([
      { $match: { status: { $in: ['UNPAID', 'PARTIALLY_PAID'] } } },
      { $group: { _id: null, total: { $sum: '$balance' } } },
    ]),
  ])

  return {
    totalPatients,
    totalUsers,
    appointmentsToday,
    pendingLabOrders,
    outstandingBalance: outstandingInvoices[0]?.total ?? 0,
  }
}

// DOCTOR dashboard: this doctor's own workload — how many distinct
// patients they've seen, today's appointment count, lab orders they
// placed whose results are in but not yet reviewed, and how many AI
// consultations they've asked for that they haven't reviewed yet (both
// are "things awaiting your attention" counters).
async function getDoctorDashboard(doctorId: string) {
  const { start, end } = todayRange()

  const [
    myPatientIds,
    appointmentsToday,
    labOrdersAwaitingReview,
    aiConsultationsUnreviewed,
  ] = await Promise.all([
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

  const [upcomingAppointments, unreadNotifications, invoices] = await Promise.all([
    Appointment.countDocuments({
      patient: patient.id,
      date: { $gte: new Date() },
      status: { $nin: ['CANCELLED', 'NO_SHOW', 'COMPLETED'] },
    }),
    Notification.countDocuments({ user: userId, readAt: { $exists: false } }),
    Invoice.aggregate([
      { $match: { patient: patient._id, status: { $in: ['UNPAID', 'PARTIALLY_PAID'] } } },
      { $group: { _id: null, total: { $sum: '$balance' } } },
    ]),
  ])

  return {
    upcomingAppointments,
    unreadNotifications,
    outstandingBalance: invoices[0]?.total ?? 0,
  }
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
  }
}
