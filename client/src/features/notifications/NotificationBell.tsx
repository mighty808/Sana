import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Bell, CalendarCheck, FlaskConical, Sparkles, Inbox } from 'lucide-react'
import { useNotifications, useMarkNotificationRead } from './api'
import type { AppNotification } from '@/types/notification'
import { getApiErrorMessage } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'

// Icon per notification type — mirrors the 3 real event types the backend
// actually fires (see types/notification.ts's comment); anything else
// (there is no "anything else" today, but `type` is loosely typed
// server-side) falls back to the generic bell.
const TYPE_ICONS: Record<string, typeof Bell> = {
  'appointment.created': CalendarCheck,
  'lab.result.ready': FlaskConical,
  'ai.response.ready': Sparkles,
}

// Where clicking a notification should take you — only Appointment and
// LabResult have a real list page to land on today; AiConsultation doesn't
// (MediAssist AI's UI is Step 8), so those just mark read without navigating
// rather than linking to a page that doesn't exist yet.
const ENTITY_ROUTES: Record<string, string> = {
  Appointment: '/appointments',
  LabResult: '/lab-results',
}

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function NotificationRow({ notification, onNavigate }: { notification: AppNotification; onNavigate: () => void }) {
  const markRead = useMarkNotificationRead()
  const navigate = useNavigate()
  const Icon = TYPE_ICONS[notification.type] ?? Bell
  const isUnread = !notification.readAt

  function handleClick() {
    if (isUnread) {
      markRead.mutate(notification._id, {
        onError: (err) => toast.error(getApiErrorMessage(err)),
      })
    }
    const route = notification.entityType ? ENTITY_ROUTES[notification.entityType] : undefined
    if (route) {
      navigate(route)
      onNavigate()
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`flex w-full items-start gap-3 rounded-md p-3 text-left transition-colors hover:bg-slate-50 ${
        isUnread ? 'bg-blue-50/60' : ''
      }`}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-slate-900">{notification.title}</p>
          {isUnread && <span className="size-1.5 shrink-0 rounded-full bg-blue-600" />}
        </div>
        <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{notification.message}</p>
        <p className="mt-1 text-[11px] text-slate-400">{timeAgo(notification.createdAt)}</p>
      </div>
    </button>
  )
}

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const { data: notifications, isLoading } = useNotifications()
  const unreadCount = notifications?.filter((n) => !n.readAt).length ?? 0

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button variant="ghost" size="icon" aria-label="Notifications" className="relative" onClick={() => setOpen(true)}>
        <Bell className="size-5 text-muted-foreground" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-medium text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </Button>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader className="border-b border-border">
          <SheetTitle>Notifications</SheetTitle>
        </SheetHeader>
        <div className="flex-1 space-y-1 overflow-y-auto px-2 pb-4">
          {isLoading &&
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-md" />)}

          {!isLoading && notifications?.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <Inbox className="size-10 text-slate-300" />
              <p className="text-sm text-slate-500">Nothing yet — you'll see real-time updates here.</p>
            </div>
          )}

          {!isLoading &&
            notifications?.map((n) => (
              <NotificationRow key={n._id} notification={n} onNavigate={() => setOpen(false)} />
            ))}
        </div>
      </SheetContent>
    </Sheet>
  )
}
