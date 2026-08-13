import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
}

// The one empty-state shape used wherever a list has nothing in it yet —
// per the spec, a quiet centered icon + heading + subtext, with an
// optional CTA, never a decorative illustration.
export function EmptyState({ icon: Icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
      <Icon className="size-12 text-slate-300" />
      <p className="mt-2 text-base font-medium text-foreground">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      {actionLabel && onAction && (
        <Button onClick={onAction} className="mt-3">
          {actionLabel}
        </Button>
      )}
    </div>
  )
}
