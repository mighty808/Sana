// Short date only — e.g. "17 Aug 2026". Used wherever only the day matters
// (patient timeline entries, lab result dates, appointment slots).
export function formatShortDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

// Date + time — e.g. "17 Aug 2026, 3:35 PM". Used wherever the exact
// moment matters (audit log entries, encounter start/complete timestamps).
export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

// Long, spelled-out date — e.g. "Monday, 17 August 2026". Used for a
// prominent page-level date heading (the dashboard greeting, a selected day
// in the appointments calendar), never for a compact list row.
export function formatLongDate(date: Date) {
  return date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

// Local "YYYY-MM-DD", for bucketing a genuine local Date (e.g. "today," or
// a month-grid cell built with `new Date(year, month, day)` — see
// getMonthGridDays/AppointmentCalendar.tsx) by calendar day. Deliberately
// built from `date`'s own local year/month/day components rather than
// `date.toISOString().slice(0, 10)` (which converts to UTC first) — that
// conversion can silently shift the date a day earlier or later depending
// on the browser's timezone and the time of day.
//
// This is NOT the right function for a date-only field that came from the
// server (e.g. Appointment.date) — see toDateKeyUTC below for that case.
export function toDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Same "YYYY-MM-DD" shape as toDateKey, but reads UTC components instead
// of local ones — use this for a date-only field that came back from the
// server as an ISO string (e.g. Appointment.date; see its model comment:
// "The calendar day of the appointment"). The server stores and compares
// that value as UTC midnight of the intended calendar day (see
// appointment.service.ts's double-booking check), so `new Date(appt.date)`
// is really "midnight UTC on day X," not a moment in the browser's own
// timezone. Reading it with toDateKey's local getters would silently shift
// it a day earlier for any negative-UTC-offset browser — the same
// UTC/local mixing bug age.ts's calculateAge had.
export function toDateKeyUTC(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Every day that belongs on a month's calendar grid: from the Monday
// on/before the 1st of `month` (0-indexed, JS `Date` convention) through the
// Sunday on/after its last day — always a whole number of 7-day weeks, so
// the grid never has a ragged final row. Monday-start to match the week-
// bucketing convention already used server-side (analytics.service.ts's
// startOfWeek).
export function getMonthGridDays(year: number, month: number): Date[] {
  const firstOfMonth = new Date(year, month, 1)
  const firstWeekday = firstOfMonth.getDay() // 0 (Sun) - 6 (Sat)
  const gridStart = new Date(year, month, 1 - (firstWeekday === 0 ? 6 : firstWeekday - 1))

  const lastOfMonth = new Date(year, month + 1, 0)
  const lastWeekday = lastOfMonth.getDay()
  const gridEnd = new Date(year, month + 1, lastWeekday === 0 ? 0 : 7 - lastWeekday)

  const days: Date[] = []
  for (const d = new Date(gridStart); d <= gridEnd; d.setDate(d.getDate() + 1)) {
    days.push(new Date(d))
  }
  return days
}
