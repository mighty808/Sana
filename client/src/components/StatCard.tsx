import type { LucideIcon } from 'lucide-react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StatCardProps {
  icon: LucideIcon
  value: string | number
  label: string
  // Optional trend — a signed percentage change vs. the prior period. Kept
  // as a plain number (not pre-formatted) so the sign always drives both
  // the arrow direction and the red/green color together, never separately.
  trend?: number
  className?: string
}

// The one stat-card shape used across every role's dashboard (per the
// design spec): a blue-tinted icon circle as the sole color accent, a bold
// number, and a muted label — never a colored card background, so a grid
// of these stays calm even when several sit side by side.
export function StatCard({ icon: Icon, value, label, trend, className }: StatCardProps) {
  return (
    <div className={cn('rounded-lg border border-border bg-card p-5 shadow-sm', className)}>
      <div className="flex items-center gap-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="tabular-nums text-2xl font-bold text-foreground">{value}</p>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
      </div>

      {trend !== undefined && (
        <p
          className={cn(
            'mt-3 flex items-center gap-1 text-xs font-medium',
            trend >= 0 ? 'text-green-600' : 'text-red-600'
          )}
        >
          {trend >= 0 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
          {Math.abs(trend)}% vs last period
        </p>
      )}
    </div>
  )
}
