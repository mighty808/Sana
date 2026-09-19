import { Patient } from '../models/Patient.js'
import { User } from '../models/User.js'
import { Role } from '../models/Role.js'
import { Appointment } from '../models/Appointment.js'
import { Encounter } from '../models/Encounter.js'
import { LabOrder } from '../models/LabOrder.js'
import { AiConsultation } from '../models/AiConsultation.js'
import { LabResult } from '../models/LabResult.js'
import { Prescription } from '../models/Prescription.js'
import { Payment } from '../models/Payment.js'
import { Notification } from '../models/Notification.js'
import { AppError } from '../utils/apiResponse.js'
import type { AuthedUser } from '../types/user.js'
import { getPatientForUser } from './patient.service.js'
import { sumOutstandingBalance } from './invoice.service.js'

// Midnight of `date` (defaulting to today), in whatever timezone the
// server itself is running in — the one place this file truncates a Date
// to the start of its day, reused by todayRange, daysAgo, and startOfWeek
// below rather than each re-implementing the same `setHours(0,0,0,0)` call.
// There's no separate timezone handling beyond that — the server's own
// clock is treated as the source of truth, the same way
// appointment.service.ts's double-booking check compares dates directly
// with no conversion. That's fine for a single hospital running in one place.
function startOfDay(date = new Date()): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

// Returns the start and end of "today." This whole file uses it anywhere
// it needs to count things like "today's appointments."
function todayRange() {
  const start = startOfDay()
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { start, end }
}

// The Admin dashboard: system-wide counts an administrator needs at a
// glance — how many patients are registered, how today's appointments are
// going, how much lab work is still outstanding, how much billing is
// unpaid, and how many staff accounts exist. Every number here is a
// simple count or sum, not a chart-ready summary like a 7-day trend — the
// frontend is free to shape these raw numbers into whatever it needs to display.
async function getAdminDashboard() {
  const { start, end } = todayRange()

  // "Staff" means every role except PATIENT. The User collection holds a
  // login account for every role, patients included, so simply counting
  // every active user would count thousands of patient logins as "staff"
  // — this filters those out first, so the number actually reflects the
  // handful of real hospital staff.
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

// The Doctor dashboard: this doctor's own workload. It shows how many
// distinct patients they've seen, today's appointment count, how many
// encounters they currently have open (this counts every open encounter
// assigned to them, including ones a nurse started at check-in — the
// point is "what's waiting on your clinical input right now," not just
// what you personally opened), lab orders they placed whose results have
// come back but haven't been reviewed yet, and how many Sana AI answers
// they've asked for but haven't reviewed yet. The last two are both
// "things waiting on your attention" counters.
async function getDoctorDashboard(doctorId: string) {
  const { start, end } = todayRange()

  const [myPatientIds, appointmentsToday, activeEncounters, labOrdersAwaitingReview, aiConsultationsUnreviewed] =
    await Promise.all([
      Appointment.distinct('patient', { doctor: doctorId }),
      Appointment.countDocuments({ doctor: doctorId, date: { $gte: start, $lt: end } }),
      Encounter.countDocuments({ doctor: doctorId, status: 'IN_PROGRESS' }),
      // A COMPLETED order means every test on it has a result, but the
      // order itself hasn't been marked REVIEWED yet — see
      // models/LabOrder.ts for the full status lifecycle.
      LabOrder.countDocuments({ doctor: doctorId, status: 'COMPLETED' }),
      AiConsultation.countDocuments({ doctor: doctorId, reviewStatus: 'UNREVIEWED' }),
    ])

  return {
    myPatients: myPatientIds.length,
    appointmentsToday,
    activeEncounters,
    labOrdersAwaitingReview,
    aiConsultationsUnreviewed,
  }
}

// The Nurse dashboard: Nurse is the front-line role, responsible for
// registration, check-in, and making sure vitals get recorded — so this
// dashboard tracks exactly those three things: how many patients were
// registered system-wide today, how many of today's appointments have
// reached CHECKED_IN, and how many checked-in (or further along)
// appointments today still have no encounter opened for them at all —
// meaning the required vitals step hasn't even started yet.
async function getNurseDashboard() {
  const { start, end } = todayRange()

  const [patientsRegisteredToday, appointmentsCheckedInToday, vitalsPendingCount] = await Promise.all([
    Patient.countDocuments({ createdAt: { $gte: start, $lt: end } }),
    Appointment.countDocuments({ date: { $gte: start, $lt: end }, status: 'CHECKED_IN' }),
    Appointment.countDocuments({
      date: { $gte: start, $lt: end },
      status: { $in: ['CHECKED_IN', 'IN_PROGRESS', 'COMPLETED'] },
      encounter: { $exists: false },
    }),
  ])

  return { patientsRegisteredToday, appointmentsCheckedInToday, vitalsPendingCount }
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
      // This compares against the start of today, not the exact current
      // moment. Appointment.date only stores the calendar day, with no
      // time attached (appointment.service.ts's double-booking check
      // relies on that too). If this compared against the exact current
      // time instead, a 5pm appointment would drop out of "upcoming" the
      // second the clock passed midnight — hours before it actually happens.
      date: { $gte: start },
      status: { $nin: ['CANCELLED', 'NO_SHOW', 'COMPLETED'] },
    }),
    Notification.countDocuments({ user: userId, readAt: { $exists: false } }),
    sumOutstandingBalance({ patient: patient._id }),
  ])

  return { upcomingAppointments, unreadNotifications, outstandingBalance }
}

// The Lab Tech dashboard: the state of the lab queue, split into 4
// stages — orders not started yet, orders with at least one result
// entered but not all of them, orders that reached COMPLETED today, and
// results this specific lab tech personally released today. That last
// one is separate from "completed today," since an order can be complete
// without every one of its results having been released to the patient yet.
async function getLabTechDashboard(labTechId: string) {
  const { start, end } = todayRange()

  const [pendingOrders, inProgressOrders, completedToday, releasedToday] = await Promise.all([
    LabOrder.countDocuments({ status: 'ORDERED' }),
    LabOrder.countDocuments({ status: 'PROCESSING' }),
    LabOrder.countDocuments({ status: 'COMPLETED', updatedAt: { $gte: start, $lt: end } }),
    LabResult.countDocuments({ releasedBy: labTechId, releasedAt: { $gte: start, $lt: end } }),
  ])

  return { pendingOrders, inProgressOrders, completedToday, releasedToday }
}

// The Pharmacist dashboard: the state of the pharmacy queue — how many
// prescriptions are waiting to be filled, and how many this pharmacist
// personally dispensed today. Same two-stat shape as Lab Tech's
// pendingOrders/releasedToday, just for the pharmacy workflow instead of the lab one.
async function getPharmacistDashboard(pharmacistId: string) {
  const { start, end } = todayRange()

  const [pendingPrescriptions, dispensedToday] = await Promise.all([
    Prescription.countDocuments({ status: 'PRESCRIBED' }),
    Prescription.countDocuments({ dispensedBy: pharmacistId, dispensedAt: { $gte: start, $lt: end } }),
  ])

  return { pendingPrescriptions, dispensedToday }
}

// This is the one function GET /analytics/dashboard calls. It branches on
// the caller's role and returns that role's own summary shape — one
// endpoint instead of five separate routes, the same "one endpoint,
// different response per role" pattern already used for GET /appointments
// and GET /lab-orders.
export async function getDashboard(user: AuthedUser) {
  switch (user.role.name) {
    case 'ADMIN':
      return { role: 'ADMIN', ...(await getAdminDashboard()) }
    case 'DOCTOR':
      return { role: 'DOCTOR', ...(await getDoctorDashboard(user.id)) }
    case 'NURSE':
      return { role: 'NURSE', ...(await getNurseDashboard()) }
    case 'PATIENT':
      return { role: 'PATIENT', ...(await getPatientDashboard(user.id)) }
    case 'LAB_TECH':
      return { role: 'LAB_TECH', ...(await getLabTechDashboard(user.id)) }
    case 'PHARMACIST':
      return { role: 'PHARMACIST', ...(await getPharmacistDashboard(user.id)) }
    default:
      // This should never actually happen — the database only allows the
      // known role names (see types/permissions.ts's ROLE_NAMES). It's
      // still here so that if a role is ever renamed or added without
      // updating this switch statement, that mistake shows up as a clear
      // 500 error instead of silently returning nothing, which would
      // otherwise send the client a bare `{success:true}` response with
      // no actual data and no sign that anything went wrong.
      throw new AppError(`No dashboard defined for role '${user.role.name}'`, 500, 'UNKNOWN_ROLE')
  }
}

// ---------------------------------------------------------------------------
// Admin-only trend analytics (GET /analytics/trends, 'analytics.readTrends').
// Unlike getDashboard above, these are real time-series aggregations meant
// to be charted, not single "right now" numbers — see AnalyticsPage.tsx on
// the client. Kept in this file since it's the same domain (reading across
// Appointment/Payment/LabOrder/LabResult), just a different shape of question.
// ---------------------------------------------------------------------------

// Midnight, `n` days before today — the shared lower bound for every trend
// below, so all of them cover the exact same window and read as comparable
// on one dashboard.
function daysAgo(n: number) {
  const d = startOfDay()
  d.setDate(d.getDate() - n)
  return d
}

// The Monday of the week `date` falls in, at midnight — used to bucket lab
// turnaround by week (see getLabTurnaround below). `getDay()` returns 0 for
// Sunday, so that case needs its own offset rather than the usual `1 - day`.
function startOfWeek(date: Date) {
  const d = startOfDay(date)
  const day = d.getDay()
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day))
  return d
}

// Daily appointment count — how busy the schedule is, day by day.
async function getAppointmentVolume(days: number) {
  const rows = await Appointment.aggregate([
    { $match: { date: { $gte: daysAgo(days - 1) } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } }, count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ])
  return rows.map((r) => ({ date: r._id as string, count: r.count as number }))
}

// Daily revenue — summed from Payment.amount/paidAt (the date cash actually
// came in), not Invoice.total/createdAt (when a bill was issued, which can
// be well before or never followed by payment).
async function getRevenueTrend(days: number) {
  const rows = await Payment.aggregate([
    { $match: { paidAt: { $gte: daysAgo(days - 1) } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$paidAt' } }, amount: { $sum: '$amount' } } },
    { $sort: { _id: 1 } },
  ])
  return rows.map((r) => ({ date: r._id as string, amount: r.amount as number }))
}

// How appointments in the window actually resolved — COMPLETED vs
// CANCELLED vs NO_SHOW vs still in progress. Surfaces the no-show rate
// (NO_SHOW count over the total) without a dedicated endpoint for it.
async function getAppointmentStatusBreakdown(days: number) {
  const rows = await Appointment.aggregate([
    { $match: { date: { $gte: daysAgo(days - 1) } } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ])
  return rows.map((r) => ({ status: r._id as string, count: r.count as number }))
}

// Weekly average turnaround time (LabResult.resultedAt - its LabOrder's
// orderedAt, in hours) over the last `weeks` weeks. This needs each
// result's parent order's orderedAt, which isn't duplicated onto LabResult
// itself, so it's a populate + in-memory grouping rather than a single
// aggregation pipeline — the last few weeks of results is a small enough
// set that this is simpler than a $lookup-based pipeline for the same result.
async function getLabTurnaround(weeks: number) {
  const results = await LabResult.find({ resultedAt: { $gte: daysAgo(weeks * 7 - 1) } })
    .select('resultedAt labOrder')
    .populate<{ labOrder: { orderedAt: Date } | null }>('labOrder', 'orderedAt')

  const buckets = new Map<string, { totalHours: number; count: number }>()
  for (const result of results) {
    const orderedAt = result.labOrder?.orderedAt
    if (!orderedAt) continue // the referenced LabOrder was deleted, or never populated

    const hours = (result.resultedAt.getTime() - orderedAt.getTime()) / (1000 * 60 * 60)
    const key = startOfWeek(result.resultedAt).toISOString().slice(0, 10)
    const bucket = buckets.get(key) ?? { totalHours: 0, count: 0 }
    bucket.totalHours += hours
    bucket.count += 1
    buckets.set(key, bucket)
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([week, { totalHours, count }]) => ({ week, avgHours: Math.round((totalHours / count) * 10) / 10 }))
}

export async function getTrends() {
  const RANGE_DAYS = 30
  const [appointmentVolume, revenue, appointmentStatusBreakdown, labTurnaround] = await Promise.all([
    getAppointmentVolume(RANGE_DAYS),
    getRevenueTrend(RANGE_DAYS),
    getAppointmentStatusBreakdown(RANGE_DAYS),
    getLabTurnaround(8),
  ])
  return { rangeDays: RANGE_DAYS, appointmentVolume, revenue, appointmentStatusBreakdown, labTurnaround }
}
