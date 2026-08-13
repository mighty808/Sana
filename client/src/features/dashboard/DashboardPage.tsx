import {
  Users,
  UserCog,
  UserPlus,
  CalendarDays,
  CalendarCheck,
  ClipboardList,
  FlaskConical,
  Receipt,
  Sparkles,
  Stethoscope,
  Bell,
  Send,
  ClipboardCheck,
  Clock,
} from 'lucide-react'
import { useAuth } from '@/features/auth/useAuth'
import { useDashboard } from './api'
import { useAppointments } from '@/features/appointments/api'
import { useNotifications } from '@/features/notifications/api'
import { isPopulated } from '@/lib/utils'
import { formatMoney } from '@/lib/money'
import { StatCard } from '@/components/StatCard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge } from '@/components/StatusBadge'

function greeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function todayLabel() {
  return new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

// Today's appointments, reusing the same /appointments data every role
// with appointment.read already has (Admin/Doctor/Nurse see it scoped by
// the backend the same way the Appointments page does) — filtered to
// today client-side rather than a separate "today" endpoint that doesn't
// exist. Not shown to roles without appointment.read (e.g. Lab Tech).
function TodaysAppointments() {
  const { data: appointments, isLoading } = useAppointments()
  const todayIso = new Date().toDateString()
  const today = appointments?.filter((a) => new Date(a.date).toDateString() === todayIso) ?? []

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Today's appointments</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading && <Skeleton className="h-24 w-full" />}
        {!isLoading && today.length === 0 && <p className="text-sm text-slate-500">Nothing scheduled today.</p>}
        {!isLoading &&
          today.slice(0, 6).map((appt) => (
            <div key={appt._id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-900">
                  {isPopulated(appt.patient) ? `${appt.patient.firstName} ${appt.patient.lastName}` : 'You'}
                </p>
                <p className="tabular-nums text-xs text-slate-500">{appt.startTime}–{appt.endTime}</p>
              </div>
              <StatusBadge status={appt.status} />
            </div>
          ))}
      </CardContent>
    </Card>
  )
}

// Recent activity — reuses the same notifications feed the bell shows
// (real events: appointments booked, lab results released, etc.), not a
// separate fabricated "activity log" the backend doesn't provide.
function RecentActivity() {
  const { data: notifications, isLoading } = useNotifications()

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recent activity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading && <Skeleton className="h-24 w-full" />}
        {!isLoading && notifications?.length === 0 && <p className="text-sm text-slate-500">Nothing yet.</p>}
        {!isLoading &&
          notifications?.slice(0, 6).map((n) => (
            <div key={n._id} className="rounded-md border border-border px-3 py-2 text-sm">
              <p className="font-medium text-slate-900">{n.title}</p>
              <p className="text-xs text-slate-500">{n.message}</p>
            </div>
          ))}
      </CardContent>
    </Card>
  )
}

export function DashboardPage() {
  const { user, hasPermission } = useAuth()
  const { data: summary, isLoading } = useDashboard()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">
          {greeting()}, {user?.firstName}
        </h1>
        <p className="text-sm text-slate-500">{todayLabel()}</p>
      </div>

      {isLoading && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      )}

      {!isLoading && summary?.role === 'ADMIN' && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard icon={Users} value={summary.totalPatients} label="Total patients" />
          <StatCard icon={UserCog} value={summary.totalStaffUsers} label="Staff accounts" />
          <StatCard icon={CalendarDays} value={summary.appointmentsToday} label="Appointments today" />
          <StatCard icon={FlaskConical} value={summary.pendingLabOrders} label="Pending lab orders" />
          <StatCard icon={Receipt} value={formatMoney(summary.outstandingBalance)} label="Outstanding balance" />
        </div>
      )}

      {!isLoading && summary?.role === 'DOCTOR' && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <StatCard icon={Users} value={summary.myPatients} label="My patients" />
          <StatCard icon={CalendarDays} value={summary.appointmentsToday} label="Appointments today" />
          <StatCard icon={Stethoscope} value={summary.activeEncounters} label="Active encounters" />
          <StatCard icon={FlaskConical} value={summary.labOrdersAwaitingReview} label="Lab orders to review" />
          <StatCard icon={Sparkles} value={summary.aiConsultationsUnreviewed} label="AI consults to review" />
        </div>
      )}

      {/* Nurse: front-line operator per Sana_Workflow_Prompt.md — today's
           registrations, how many patients have checked in, and how many
           checked-in-or-later appointments today still have no encounter
           at all (i.e. the mandatory vitals step hasn't started yet). */}
      {!isLoading && summary?.role === 'NURSE' && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <StatCard icon={UserPlus} value={summary.patientsRegisteredToday} label="Patients registered today" />
          <StatCard icon={CalendarCheck} value={summary.appointmentsCheckedInToday} label="Checked in today" />
          <StatCard icon={ClipboardList} value={summary.vitalsPendingCount} label="Vitals pending" />
        </div>
      )}

      {/* Lab Tech: the 4-stage queue split Sana_Workflow_Prompt.md calls
           out — orders not started, orders partway through, orders that
           finished today, and results this tech personally released today. */}
      {!isLoading && summary?.role === 'LAB_TECH' && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard icon={FlaskConical} value={summary.pendingOrders} label="Pending orders" />
          <StatCard icon={Clock} value={summary.inProgressOrders} label="In progress" />
          <StatCard icon={ClipboardCheck} value={summary.completedToday} label="Completed today" />
          <StatCard icon={Send} value={summary.releasedToday} label="Released today" />
        </div>
      )}

      {!isLoading && summary?.role === 'PATIENT' && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <StatCard icon={CalendarDays} value={summary.upcomingAppointments} label="Upcoming appointments" />
          <StatCard icon={Bell} value={summary.unreadNotifications} label="Unread notifications" />
          <StatCard icon={Receipt} value={formatMoney(summary.outstandingBalance)} label="Outstanding balance" />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {hasPermission('appointment.read') && <TodaysAppointments />}
        <RecentActivity />
      </div>
    </div>
  )
}
