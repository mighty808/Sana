import { cn } from '@/lib/utils'

// Every state enum in Sana's data model (appointment/lab-order/lab-result/
// invoice/AI-review status) renders through this one component, so the
// color mapping lives in exactly one place instead of being re-decided on
// every screen. Per the design spec, color is never the only signal — the
// text label is always visible alongside the tint, satisfying WCAG's
// "don't encode meaning in color alone" requirement.
const STATUS_STYLES: Record<string, string> = {
  BOOKED: 'bg-blue-50 text-blue-700 border-blue-200',
  CONFIRMED: 'bg-sky-50 text-sky-700 border-sky-200',
  CHECKED_IN: 'bg-amber-50 text-amber-700 border-amber-200',
  IN_PROGRESS: 'bg-purple-50 text-purple-700 border-purple-200',
  COMPLETED: 'bg-green-50 text-green-700 border-green-200',
  CANCELLED: 'bg-slate-100 text-slate-500 border-slate-200',
  NO_SHOW: 'bg-slate-100 text-slate-500 border-slate-200',
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
  VOIDED: 'bg-slate-100 text-slate-500 border-slate-200',
  ACCEPTED: 'bg-green-50 text-green-700 border-green-200',
  PARTIALLY_ACCEPTED: 'bg-amber-50 text-amber-700 border-amber-200',
  IGNORED: 'bg-slate-100 text-slate-500 border-slate-200',
  UNREVIEWED: 'bg-blue-50 text-blue-700 border-blue-200',
  ACTIVE: 'bg-green-50 text-green-700 border-green-200',
  INACTIVE: 'bg-slate-100 text-slate-500 border-slate-200',
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

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const style = STATUS_STYLES[status] ?? 'bg-slate-100 text-slate-500 border-slate-200'
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
