import { Bell, Inbox } from 'lucide-react'
import { useAllNotifications, useNotifications, useRealtimeAllNotifications } from './api'
import { NotificationRow, TYPE_ICONS, timeAgo } from './NotificationBell'
import type { AppNotification } from '@/types/notification'
import { isPopulated } from '@/lib/utils'
import { useAuth } from '@/features/auth/useAuth'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/EmptyState'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

// One row in the Admin oversight feed. Deliberately not the same
// NotificationRow used for the personal list above — that component's
// click marks the notification read and navigates to its entity page, both
// of which assume it's *your own* notification. Neither is safe here: an
// Admin marking someone else's notification read would misrepresent who
// actually saw it, and navigating could land on a page the Admin has no
// permission for (e.g. /referrals, which only Doctor can open). So this
// row is purely informational — the same visual language, no interaction.
function OversightNotificationRow({ notification }: { notification: AppNotification }) {
  const Icon = TYPE_ICONS[notification.type] ?? Bell
  const recipient = isPopulated(notification.user) ? `${notification.user.firstName} ${notification.user.lastName}` : null

  return (
    <div className="flex w-full items-start gap-3 rounded-md p-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-slate-900">{notification.title}</p>
          <Badge variant="outline" className={notification.readAt ? 'text-muted-foreground' : 'border-blue-200 bg-blue-50 text-blue-600'}>
            {notification.readAt ? 'Read' : 'Unread'}
          </Badge>
        </div>
        <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">{notification.message}</p>
        <p className="mt-1 text-[11px] text-slate-600">
          {recipient && `To ${recipient} · `}
          {timeAgo(notification.createdAt)}
        </p>
      </div>
    </div>
  )
}

function MyNotifications() {
  const { data: notifications, isLoading } = useNotifications()

  return (
    <div className="space-y-1 rounded-lg border border-border bg-card p-2 shadow-sm">
      {isLoading && Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-md" />)}

      {!isLoading && notifications?.length === 0 && (
        <EmptyState icon={Inbox} title="Nothing yet" description="You'll see real-time updates here." />
      )}

      {!isLoading && notifications?.map((n) => <NotificationRow key={n._id} notification={n} onNavigate={() => {}} />)}
    </div>
  )
}

// Radix's TabsContent unmounts inactive tabs by default (no forceMount), so
// this component — and the fetch/socket subscription inside it — only ever
// exists while the "All" tab is actually the one showing.
function AllNotifications() {
  const { data: notifications, isLoading } = useAllNotifications({ enabled: true })
  useRealtimeAllNotifications({ enabled: true })

  return (
    <div className="space-y-1 rounded-lg border border-border bg-card p-2 shadow-sm">
      {isLoading && Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-md" />)}

      {!isLoading && notifications?.length === 0 && (
        <EmptyState icon={Inbox} title="Nothing yet" description="Notifications sent to any user will show up here." />
      )}

      {!isLoading && notifications?.map((n) => <OversightNotificationRow key={n._id} notification={n} />)}
    </div>
  )
}

// The full-page version of the header bell's dropdown panel. It shows the same
// data and reuses the same NotificationRow component (imported rather than
// rebuilt from scratch, so the two never end up looking different from each
// other). This is just reachable as its own page in the sidebar, instead of only
// through the dropdown.
//
// Admin additionally gets a "Mine / All" toggle here — everyone else has
// only ever had "Mine," and keeps exactly that, unchanged.
export function NotificationsPage() {
  const { hasPermission } = useAuth()
  const canSeeAll = hasPermission('notification.readAll')

  if (!canSeeAll) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-600">Everything sent to you, newest first.</p>
        <MyNotifications />
      </div>
    )
  }

  return (
    <Tabs defaultValue="mine" className="space-y-4">
      <TabsList>
        <TabsTrigger value="mine">Mine</TabsTrigger>
        <TabsTrigger value="all">All</TabsTrigger>
      </TabsList>
      <TabsContent value="mine" className="space-y-4">
        <p className="text-sm text-slate-600">Everything sent to you, newest first.</p>
        <MyNotifications />
      </TabsContent>
      <TabsContent value="all" className="space-y-4">
        <p className="text-sm text-slate-600">Every notification sent to every user, newest first — for oversight only.</p>
        <AllNotifications />
      </TabsContent>
    </Tabs>
  )
}
