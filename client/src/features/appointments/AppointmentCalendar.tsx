import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { getMonthGridDays, toDateKey, toDateKeyUTC } from '@/lib/date'
import { isPopulated } from '@/lib/utils'
import type { Appointment } from '@/types/appointment'
import { Button } from '@/components/ui/button'

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// Solid dot colors per status — the same hue family StatusBadge.tsx and
// AnalyticsPage.tsx already use for these exact statuses (blue/sky/amber/
// purple/green/slate/red), just as a small dot here instead of a pastel
// badge or a chart fill, so a status reads as the same color everywhere in
// the app rather than introducing a fourth palette for it.
const STATUS_DOT_COLORS: Record<string, string> = {
  BOOKED: '#3B82F6',
  CONFIRMED: '#0EA5E9',
  CHECKED_IN: '#F59E0B',
  IN_PROGRESS: '#A855F7',
  COMPLETED: '#16A34A',
  CANCELLED: '#94A3B8',
  NO_SHOW: '#DC2626',
}

const MAX_CHIPS_PER_DAY = 3

// A plain month grid — no calendar library, since none exists in this repo
// and the data shape here (a flat list of {date, startTime, patient,
// status}) doesn't need one. Each day cell shows up to a few compact
// appointment chips plus a "+N more" overflow; clicking anywhere on a cell
// hands that day back to the caller (AppointmentsPage.tsx shows that day's
// full list below the grid and offers a pre-filled "Book" button).
export function AppointmentCalendar({
  appointments,
  onSelectDay,
}: {
  appointments: Appointment[]
  onSelectDay: (date: Date) => void
}) {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())

  const gridDays = useMemo(() => getMonthGridDays(year, month), [year, month])

  // Bucketed once per render rather than filtering the full list per cell —
  // O(appointments) instead of O(appointments × cells).
  const appointmentsByDay = useMemo(() => {
    const map = new Map<string, Appointment[]>()
    for (const appt of appointments) {
      const key = toDateKeyUTC(new Date(appt.date))
      const bucket = map.get(key)
      if (bucket) bucket.push(appt)
      else map.set(key, [appt])
    }
    return map
  }, [appointments])

  function goToMonth(delta: number) {
    const next = new Date(year, month + delta, 1)
    setYear(next.getFullYear())
    setMonth(next.getMonth())
  }

  function goToToday() {
    setYear(today.getFullYear())
    setMonth(today.getMonth())
  }

  const todayKey = toDateKey(today)
  const monthLabel = new Date(year, month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

  return (
    <div className="rounded-lg border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-border p-4">
        <p className="text-sm font-semibold text-slate-900">{monthLabel}</p>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={goToToday}>
            Today
          </Button>
          <Button variant="outline" size="icon" className="size-8" onClick={() => goToMonth(-1)}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="icon" className="size-8" onClick={() => goToMonth(1)}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 border-b border-border text-center text-xs font-medium text-slate-600">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="py-2">
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {gridDays.map((day) => {
          const key = toDateKey(day)
          const dayAppointments = appointmentsByDay.get(key) ?? []
          const inCurrentMonth = day.getMonth() === month
          const isToday = key === todayKey

          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelectDay(day)}
              className={`min-h-24 border-r border-b border-border p-1.5 text-left last:border-r-0 hover:bg-slate-50 [&:nth-child(7n)]:border-r-0 ${
                inCurrentMonth ? '' : 'bg-slate-50/50'
              }`}
            >
              <span
                className={`inline-flex size-6 items-center justify-center rounded-full text-xs ${
                  isToday
                    ? 'bg-blue-600 font-semibold text-white'
                    : inCurrentMonth
                      ? 'text-slate-700'
                      : 'text-slate-300'
                }`}
              >
                {day.getDate()}
              </span>
              <div className="mt-1 space-y-0.5">
                {dayAppointments.slice(0, MAX_CHIPS_PER_DAY).map((appt) => (
                  <div key={appt._id} className="flex items-center gap-1 truncate text-[11px] text-slate-600">
                    <span
                      className="size-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: STATUS_DOT_COLORS[appt.status] ?? '#94A3B8' }}
                    />
                    <span className="truncate">
                      {appt.startTime} {isPopulated(appt.patient) ? appt.patient.lastName : 'Patient'}
                    </span>
                  </div>
                ))}
                {dayAppointments.length > MAX_CHIPS_PER_DAY && (
                  <p className="text-[11px] text-slate-600">+{dayAppointments.length - MAX_CHIPS_PER_DAY} more</p>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
