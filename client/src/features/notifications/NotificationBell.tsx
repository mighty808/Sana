import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Bell, CalendarCheck, FlaskConical, Sparkles, Inbox, AlertTriangle, Send, Pill, MessageSquare, CheckCircle2 } from 'lucide-react'
import { useNotifications, useMarkNotificationRead } from './api'
import type { AppNotification } from '@/types/notification'
import { getApiErrorMessage } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'

// A separate icon for each notification type the backend actually sends
// (see types/notification.ts's comment). Any other value falls back to the
// plain bell icon — the `type` field isn't strictly limited on the server,
// so this fallback exists just in case.
export const TYPE_ICONS: Record<string, typeof Bell> = {
  'appointment.created': CalendarCheck,
  'lab.result.ready': FlaskConical,
  'ai.response.ready': Sparkles,
  'ai.acuity.critical': AlertTriangle,
  'referral.created': Send,
  'referral.message.created': MessageSquare,
  'referral.status.updated': CheckCircle2,
  'prescription.dispensed': Pill,
}

// 'ai.acuity.critical' (a nurse's vitals check flagging a patient as
// CRITICAL — see ai.service.ts's notifyCriticalAcuity) gets red styling
// instead of the routine blue, so it visually stands out from the normal
// volume of AI/appointment/lab notifications rather than blending in.
const CRITICAL_TYPE = 'ai.acuity.critical'

// Where clicking a notification should take the user. Only Appointment,
// LabResult, Referral, and Prescription have a real page to go to right
// now. AiConsultation notifications don't have a page to link to yet, so
// clicking one of those just marks it as read without navigating anywhere,
// instead of linking to a page that doesn't exist.
//
// Every `entityType` any notify() call passes on the server needs an entry
// here, or clicking that notification silently does nothing — check
// against the notify() calls in server/src/services when adding a feature.
const ENTITY_ROUTES: Record<string, string> = {
  Appointment: '/appointments',
  LabResult: '/lab-results',
  Referral: '/referrals',
  // Sent to the prescribing doctor when a pharmacist dispenses it (see
  // prescription.service.ts's dispensePrescription).
  Prescription: '/prescriptions',
}

export function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function NotificationRow({ notification, onNavigate }: { notification: AppNotification; onNavigate: () => void }) {
  const markRead = useMarkNotificationRead()
  const navigate = useNavigate()
  const Icon = TYPE_ICONS[notification.type] ?? Bell
  const isUnread = !notification.readAt
  const isCritical = notification.type === CRITICAL_TYPE

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
        isUnread ? (isCritical ? 'bg-red-50/60' : 'bg-blue-50/60') : ''
      }`}
    >
      <span
        className={`flex size-8 shrink-0 items-center justify-center rounded-full ${
          isCritical ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'
        }`}
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-slate-900">{notification.title}</p>
          {isUnread && <span className="size-1.5 shrink-0 rounded-full bg-blue-600" />}
        </div>
        <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">{notification.message}</p>
        <p className="mt-1 text-[11px] text-slate-600">{timeAgo(notification.createdAt)}</p>
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
              <p className="text-sm text-slate-600">Nothing yet — you'll see real-time updates here.</p>
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
