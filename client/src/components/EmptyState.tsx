import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
}

// This is the one "nothing here yet" layout used wherever a list is empty:
// a quiet, centered icon, heading, and subtext, with an optional action
// button. It never uses a decorative illustration.
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
