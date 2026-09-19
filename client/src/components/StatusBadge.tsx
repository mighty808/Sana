import { cn } from '@/lib/utils'

// Every status value in Sana's data (appointment, lab order, lab result,
// invoice, AI-review status, and so on) is displayed through this one
// component, so the color for each status is decided in exactly one place
// instead of separately on every screen. Color is never the only signal
// here — the text label is always shown along with the color, which is
// important for users who have trouble distinguishing colors.
const STATUS_STYLES: Record<string, string> = {
  BOOKED: 'bg-blue-50 text-blue-700 border-blue-200',
  CONFIRMED: 'bg-sky-50 text-sky-700 border-sky-200',
  CHECKED_IN: 'bg-amber-50 text-amber-700 border-amber-200',
  IN_PROGRESS: 'bg-purple-50 text-purple-700 border-purple-200',
  COMPLETED: 'bg-green-50 text-green-700 border-green-200',
  CANCELLED: 'bg-slate-100 text-slate-600 border-slate-200',
  NO_SHOW: 'bg-slate-100 text-slate-600 border-slate-200',
  URGENT: 'bg-red-50 text-red-700 border-red-200',
  CRITICAL: 'bg-red-50 text-red-700 border-red-200',
  PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
  ORDERED: 'bg-blue-50 text-blue-700 border-blue-200',
  PROCESSING: 'bg-purple-50 text-purple-700 border-purple-200',
  REVIEWED: 'bg-green-50 text-green-700 border-green-200',
  ENTERED: 'bg-purple-50 text-purple-700 border-purple-200',
  RELEASED: 'bg-green-50 text-green-700 border-green-200',
  NORMAL: 'bg-green-50 text-green-700 border-green-200',
  ABNORMAL: 'bg-amber-50 text-amber-700 border-amber-200',
  UNPAID: 'bg-red-50 text-red-700 border-red-200',
  PARTIALLY_PAID: 'bg-amber-50 text-amber-700 border-amber-200',
  PAID: 'bg-green-50 text-green-700 border-green-200',
  VOIDED: 'bg-slate-100 text-slate-600 border-slate-200',
  ACCEPTED: 'bg-green-50 text-green-700 border-green-200',
  PARTIALLY_ACCEPTED: 'bg-amber-50 text-amber-700 border-amber-200',
  IGNORED: 'bg-slate-100 text-slate-600 border-slate-200',
  UNREVIEWED: 'bg-blue-50 text-blue-700 border-blue-200',
  ACTIVE: 'bg-green-50 text-green-700 border-green-200',
  INACTIVE: 'bg-slate-100 text-slate-600 border-slate-200',
  // Referral status — PENDING/COMPLETED already have entries above.
  ACKNOWLEDGED: 'bg-sky-50 text-sky-700 border-sky-200',
  // Prescription status — CANCELLED already has an entry above. Without
  // these two, a freshly written and a successfully dispensed prescription
  // both fell through to the grey default, making them indistinguishable
  // from a cancelled one at a glance. Blue for "written, waiting on the
  // pharmacy" and green for "dispensed" match how ORDERED/RELEASED read on
  // the lab side, which is the same order-then-fulfil shape.
  PRESCRIBED: 'bg-blue-50 text-blue-700 border-blue-200',
  DISPENSED: 'bg-green-50 text-green-700 border-green-200',
}

// Human-readable labels for statuses whose raw enum value (SCREAMING_SNAKE)
// shouldn't be shown verbatim.
const STATUS_LABELS: Record<string, string> = {
  CHECKED_IN: 'Checked in',
  IN_PROGRESS: 'In progress',
  NO_SHOW: 'No show',
  PARTIALLY_PAID: 'Partially paid',
  PARTIALLY_ACCEPTED: 'Partially accepted',
}

function toTitleCase(value: string) {
  return value
    .toLowerCase()
    .split('_')
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(' ')
}

// The same color lookup StatusBadge itself uses below, exported on its own
// for the handful of places that need a status's color on a badge showing
// different text than the status label — e.g. a lab order's per-test chips
// (LabOrdersPage.tsx, PatientDetailPage.tsx), which show the test's name
// colored by PENDING/COMPLETED, not the word "Pending"/"Completed" itself.
// StatusBadge can't be reused directly there since it always renders the
// status's own label as the badge's only content.
export function statusBadgeClassName(status: string): string {
  return STATUS_STYLES[status] ?? 'bg-slate-100 text-slate-600 border-slate-200'
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const style = statusBadgeClassName(status)
  const label = STATUS_LABELS[status] ?? toTitleCase(status)

  return (
    <span
      className={cn(
        'inline-flex w-fit shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
        style,
        className
      )}
    >
      {label}
    </span>
  )
}
