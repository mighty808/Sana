import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, type ApiSuccess } from '@/lib/api'
import { connectSocket } from '@/lib/socket'
import type { AppNotification } from '@/types/notification'

const NOTIFICATIONS_KEY = ['notifications']
const ALL_NOTIFICATIONS_KEY = ['notifications', 'all']

export function useNotifications() {
  return useQuery({
    queryKey: NOTIFICATIONS_KEY,
    queryFn: async () => {
      const res = await api.get<ApiSuccess<AppNotification[]>>('/notifications')
      return res.data.data
    },
  })
}

// GET /notifications/all — Admin-only oversight feed (requires
// 'notification.readAll'). Only fetched while the "All" tab on
// NotificationsPage.tsx is actually selected, via `enabled` — never issued
// for a role that doesn't have the permission in the first place.
export function useAllNotifications(options: { enabled: boolean }) {
  return useQuery({
    queryKey: ALL_NOTIFICATIONS_KEY,
    queryFn: async () => {
      const res = await api.get<ApiSuccess<AppNotification[]>>('/notifications/all')
      return res.data.data
    },
    enabled: options.enabled,
  })
}

// Live-updates the oversight feed above. notify() (see
// notification.service.ts) emits 'notification.created.any' to everyone in
// the `role:ADMIN` socket room for exactly this — refetching the whole list
// on each event (rather than prepending, the way useRealtimeNotifications
// does for the personal one) since this feed's ordering/population needs to
// stay correct across every user, not just one.
export function useRealtimeAllNotifications(options: { enabled: boolean }) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!options.enabled) return
    const socket = connectSocket()

    function handleCreated() {
      queryClient.invalidateQueries({ queryKey: ALL_NOTIFICATIONS_KEY })
    }

    socket.on('notification.created.any', handleCreated)
    return () => {
      socket.off('notification.created.any', handleCreated)
    }
  }, [options.enabled, queryClient])
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.patch<ApiSuccess<AppNotification>>(`/notifications/${id}/read`)
      return res.data.data
    },
    // This updates the local "read" state right away instead of waiting for the
    // server to respond, so the unread badge count feels instant to the user.
    // If the request actually fails, it just gets corrected the next time the
    // data refreshes in the background.
    onSuccess: (updated) => {
      queryClient.setQueryData<AppNotification[]>(NOTIFICATIONS_KEY, (old) =>
        old?.map((n) => (n._id === updated._id ? updated : n)),
      )
    },
  })
}

// Listens for the 'notification.created' event, which the backend sends out
// every time it calls notify() (see notification.service.ts). When a new
// notification arrives, it's added to the top of the locally stored list, so
// the bell icon updates immediately without needing to refetch from the server,
// and a toast message pops up. This is set up once, high up in the component
// tree (AppShell), and stays active for as long as the user is signed in, so
// every screen shares the same connection instead of each page setting up its own.
export function useRealtimeNotifications() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const socket = connectSocket()

    function handleCreated(notification: AppNotification) {
      queryClient.setQueryData<AppNotification[]>(NOTIFICATIONS_KEY, (old) =>
        old ? [notification, ...old] : [notification],
      )
      toast.info(notification.title, { description: notification.message })
    }

    socket.on('notification.created', handleCreated)
    return () => {
      socket.off('notification.created', handleCreated)
    }
  }, [queryClient])
}
