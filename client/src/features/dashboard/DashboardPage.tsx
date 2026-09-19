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
  Pill,
} from 'lucide-react'
import { useAuth } from '@/features/auth/useAuth'
import { useDashboard } from './api'
import { useAppointments } from '@/features/appointments/api'
import { useNotifications } from '@/features/notifications/api'
import { isPopulated } from '@/lib/utils'
import { formatMoney } from '@/lib/money'
import { formatLongDate } from '@/lib/date'
import { StatCard } from '@/components/StatCard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge } from '@/components/StatusBadge'

function greeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

// Shows today's appointments, reusing the exact same /appointments data
// that any role with the appointment.read permission already gets (the
// server scopes it per role the same way it does for the Appointments
// page). The list is filtered down to just today's appointments in the
// browser, since there's no separate "today only" endpoint on the server.
// This isn't shown to roles that lack appointment.read, such as Lab Tech.
function TodaysAppointments() {
  const { data: appointments, isLoading } = useAppointments()
  const todayIso = new Date().toDateString()
  const today = appointments?.filter((a) => new Date(a.date).toDateString() === todayIso) ?? []

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="text-base">Today's appointments</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading && (
          <div className="space-y-2 p-6 pt-0">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        )}
        {!isLoading && today.length === 0 && (
          <p className="px-6 pb-6 text-sm text-slate-600">Nothing scheduled today.</p>
        )}
        {!isLoading && today.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50 hover:bg-slate-50">
                <TableHead>Time</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead>Doctor</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {today.slice(0, 6).map((appt) => (
                <TableRow key={appt._id}>
                  <TableCell className="tabular-nums text-slate-700">
                    {appt.startTime}–{appt.endTime}
                  </TableCell>
                  <TableCell className="font-medium text-slate-900">
                    {isPopulated(appt.patient) ? `${appt.patient.firstName} ${appt.patient.lastName}` : 'You'}
                  </TableCell>
                  <TableCell className="text-slate-700">
                    {isPopulated(appt.doctor) ? `Dr. ${appt.doctor.firstName} ${appt.doctor.lastName}` : '—'}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={appt.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

// Shows recent activity by reusing the same notifications feed shown in the
// notification bell (real events like appointments being booked or lab
// results being released), rather than a separate "activity log" feature
// that the server doesn't actually provide.
function RecentActivity() {
  const { data: notifications, isLoading } = useNotifications()

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recent activity</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && <Skeleton className="h-24 w-full" />}
        {!isLoading && notifications?.length === 0 && <p className="text-sm text-slate-600">Nothing yet.</p>}
        {/* Sized to show roughly 3 rows at once — the rest scrolls inside
            this box instead of pushing the rest of the dashboard down. */}
        {!isLoading && notifications && notifications.length > 0 && (
          <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
            {notifications.map((n) => (
              <div key={n._id} className="rounded-md border border-border px-3 py-2 text-sm">
                <p className="font-medium text-slate-900">{n.title}</p>
                <p className="text-xs text-slate-600">{n.message}</p>
              </div>
            ))}
          </div>
        )}
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
        <p className="text-xs font-bold tracking-wider text-muted-foreground uppercase">{formatLongDate(new Date())}</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">
          {greeting()}, {user?.firstName}
        </h1>
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

      {/* Nurse view: today's new patient registrations, how many patients
           have checked in, and how many of today's checked-in (or later)
           appointments still have no encounter started at all — meaning
           the required vitals step for that patient hasn't begun yet. */}
      {!isLoading && summary?.role === 'NURSE' && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <StatCard icon={UserPlus} value={summary.patientsRegisteredToday} label="Patients registered today" />
          <StatCard icon={CalendarCheck} value={summary.appointmentsCheckedInToday} label="Checked in today" />
          <StatCard icon={ClipboardList} value={summary.vitalsPendingCount} label="Vitals pending" />
        </div>
      )}

      {/* Lab Tech view: the four stages of the lab queue — orders not yet
           started, orders that are partway through, orders finished today,
           and results this lab tech personally released today. */}
      {!isLoading && summary?.role === 'LAB_TECH' && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard icon={FlaskConical} value={summary.pendingOrders} label="Pending orders" />
          <StatCard icon={Clock} value={summary.inProgressOrders} label="In progress" />
          <StatCard icon={ClipboardCheck} value={summary.completedToday} label="Completed today" />
          <StatCard icon={Send} value={summary.releasedToday} label="Released today" />
        </div>
      )}

      {/* Pharmacist view: same two-stat "pending queue" + "done by me
           today" shape as Lab Tech's, just for the pharmacy workflow. */}
      {!isLoading && summary?.role === 'PHARMACIST' && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard icon={Pill} value={summary.pendingPrescriptions} label="Pending prescriptions" />
          <StatCard icon={ClipboardCheck} value={summary.dispensedToday} label="Dispensed today" />
        </div>
      )}

      {!isLoading && summary?.role === 'PATIENT' && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <StatCard icon={CalendarDays} value={summary.upcomingAppointments} label="Upcoming appointments" />
          <StatCard icon={Bell} value={summary.unreadNotifications} label="Unread notifications" />
          <StatCard icon={Receipt} value={formatMoney(summary.outstandingBalance)} label="Outstanding balance" />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {hasPermission('appointment.read') && <TodaysAppointments />}
        <RecentActivity />
      </div>
    </div>
  )
}
