import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, type ApiSuccess } from '@/lib/api'
import { connectSocket } from '@/lib/socket'
import type { AppNotification } from '@/types/notification'

const NOTIFICATIONS_KEY = ['notifications']

export function useNotifications() {
  return useQuery({
    queryKey: NOTIFICATIONS_KEY,
    queryFn: async () => {
      const res = await api.get<ApiSuccess<AppNotification[]>>('/notifications')
      return res.data.data
    },
  })
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.patch<ApiSuccess<AppNotification>>(`/notifications/${id}/read`)
      return res.data.data
    },
    // Optimistic: flip readAt locally immediately rather than waiting on
    // the round trip — the unread badge count should feel instant, and a
    // failed request just gets corrected on the next background refetch.
    onSuccess: (updated) => {
      queryClient.setQueryData<AppNotification[]>(NOTIFICATIONS_KEY, (old) =>
        old?.map((n) => (n._id === updated._id ? updated : n)),
      )
    },
  })
}

// Subscribes to the 'notification.created' event every notify() call on the
// backend emits (see notification.service.ts) — prepends the new
// notification into the cached list (so the bell updates without a
// refetch) and surfaces a toast. Mounted once, high in the tree (AppShell),
// for the lifetime of an authenticated session — every screen benefits
// from the same subscription rather than each page managing its own.
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
