import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type ApiSuccess } from '@/lib/api'
import { connectSocket } from '@/lib/socket'
import type { AppNotification } from '@/types/notification'
import type { Referral, ReferralMessage, ReferralStatus } from '@/types/referral'

// Matches server/src/schemas/referral.ts's createReferralSchema.
export interface ReferralInput {
  toDoctor: string
  reason: string
  notes?: string
}

// POST /encounters/:id/referrals — scoped to the encounter it came from,
// the same way useAddDiagnosis is (see features/encounters/api.ts).
export function useCreateReferral(encounterId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: ReferralInput) => {
      const res = await api.post<ApiSuccess<Referral>>(`/encounters/${encounterId}/referrals`, input)
      return res.data.data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['encounters', 'detail', encounterId] }),
  })
}

// GET /referrals — the caller's own incoming worklist (referrals sent TO them).
export function useIncomingReferrals() {
  return useQuery({
    queryKey: ['referrals', 'incoming'],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<Referral[]>>('/referrals')
      return res.data.data
    },
  })
}

// GET /referrals/sent — the mirror: referrals this doctor sent out. `toDoctor`
// comes back populated here (the caller is the sender, so the useful name is
// the recipient's), which is the opposite of the incoming list.
export function useOutgoingReferrals() {
  return useQuery({
    queryKey: ['referrals', 'sent'],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<Referral[]>>('/referrals/sent')
      return res.data.data
    },
  })
}

export function useUpdateReferralStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ReferralStatus }) => {
      const res = await api.patch<ApiSuccess<Referral>>(`/referrals/${id}/status`, { status })
      return res.data.data
    },
    // Same two-places problem as dispensing a prescription: the receiving
    // doctor's own worklist AND the Referrals card on the originating
    // encounter, which the referring doctor may well have open (that card
    // is read-only precisely because the status changes from here). The
    // updated referral carries its `encounter` id, so only that encounter's
    // detail query is invalidated.
    onSuccess: (referral) => {
      queryClient.invalidateQueries({ queryKey: ['referrals', 'incoming'] })
      // The sender's "Sent" list shows this same status, so it goes stale too.
      queryClient.invalidateQueries({ queryKey: ['referrals', 'sent'] })
      queryClient.invalidateQueries({ queryKey: ['encounters', 'detail', referral.encounter] })
    },
  })
}

// Whether a given referral has any unread notification pointing at it — the
// same generic Notification data the sidebar badge and the bell already
// use (see AppShell.tsx's referralUnreadCount), just narrowed to one
// referral's id so a single row can show its own unread dot without any
// new per-referral read-state of its own.
export function referralHasUnread(notifications: AppNotification[] | undefined, referralId: string): boolean {
  return notifications?.some((n) => !n.readAt && n.entityType === 'Referral' && n.entityId === referralId) ?? false
}

// The message-thread query key for one referral — shared by every hook
// below so the mutation and the live-update listener touch the same cache
// entry.
const messagesKey = (referralId: string) => ['referrals', referralId, 'messages']

// GET /referrals/:id/messages — only fetched while a thread dialog is
// actually open (`enabled`), since every doctor could in principle have
// many referrals and there's no need to hold a live subscription open for
// ones nobody is looking at.
export function useReferralMessages(referralId: string, options: { enabled: boolean }) {
  return useQuery({
    queryKey: messagesKey(referralId),
    queryFn: async () => {
      const res = await api.get<ApiSuccess<ReferralMessage[]>>(`/referrals/${referralId}/messages`)
      return res.data.data
    },
    enabled: options.enabled,
  })
}

// POST /referrals/:id/messages. Appends the server's own response straight
// into the cache (it comes back fully populated) rather than invalidating
// and refetching — the sender's own copy of a message they just sent
// doesn't need a round trip to confirm.
export function useSendReferralMessage(referralId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: string) => {
      const res = await api.post<ApiSuccess<ReferralMessage>>(`/referrals/${referralId}/messages`, { body })
      return res.data.data
    },
    onSuccess: (message) => {
      queryClient.setQueryData<ReferralMessage[]>(messagesKey(referralId), (old) => (old ? [...old, message] : [message]))
    },
  })
}

// Live-updates an open thread when the OTHER doctor on the referral sends a
// message. notify() (server/src/services/notification.service.ts) only
// emits the Notification it created — not the ReferralMessage itself — so
// this can't append the new message directly the way useSendReferralMessage
// does for the sender's own copy; it refetches the thread instead, keyed
// off the notification's entityId matching this referral. Modeled on
// useRealtimeNotifications (features/notifications/api.ts), but scoped to
// one referral and only listening while its dialog is open.
export function useReferralMessagesLiveUpdate(referralId: string, options: { enabled: boolean }) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!options.enabled) return

    const socket = connectSocket()
    function handleMessageCreated(notification: AppNotification) {
      if (notification.entityType === 'Referral' && notification.entityId === referralId) {
        queryClient.invalidateQueries({ queryKey: messagesKey(referralId) })
      }
    }

    socket.on('referral.message.created', handleMessageCreated)
    return () => {
      socket.off('referral.message.created', handleMessageCreated)
    }
  }, [referralId, options.enabled, queryClient])
}
