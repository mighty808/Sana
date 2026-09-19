import { useEffect, useState } from 'react'
import { MessageSquare, Send } from 'lucide-react'
import { toast } from 'sonner'
import { useReferralMessages, useReferralMessagesLiveUpdate, useSendReferralMessage } from './api'
import { useNotifications, useMarkNotificationRead } from '@/features/notifications/api'
import type { Referral } from '@/types/referral'
import { useAuth } from '@/features/auth/useAuth'
import { isPopulated } from '@/lib/utils'
import { getApiErrorMessage } from '@/lib/api'
import { formatDateTime } from '@/lib/date'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/EmptyState'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

// Shared thread view for a single referral's conversation — opened from
// both ReferralsPage.tsx (the incoming worklist) and EncounterPage.tsx's
// ReferralsList (the outgoing card), since a referral only ever has the one
// thread regardless of which side you're looking at it from.
export function ReferralMessagesDialog({ referral }: { referral: Referral }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const { user } = useAuth()

  const { data: messages, isLoading } = useReferralMessages(referral._id, { enabled: open })
  useReferralMessagesLiveUpdate(referral._id, { enabled: open })
  const sendMessage = useSendReferralMessage(referral._id)

  // Opening the thread is the clearest possible signal that its unread
  // notifications (a new message, or a status change) have now been seen —
  // clear them here too, not just when someone happens to open the bell
  // sheet and click the row there. markAsRead on an already-read
  // notification is a no-op server-side, so re-running this on every
  // `notifications` update is harmless.
  const { data: notifications } = useNotifications()
  const markRead = useMarkNotificationRead()
  useEffect(() => {
    if (!open) return
    const unread = notifications?.filter((n) => !n.readAt && n.entityType === 'Referral' && n.entityId === referral._id)
    unread?.forEach((n) => markRead.mutate(n._id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, notifications, referral._id])

  async function handleSend() {
    const body = draft.trim()
    if (!body) return
    try {
      await sendMessage.mutateAsync(body)
      setDraft('')
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  // Names whoever is on the other side of the referral from the current
  // user, for the dialog's own title — the two doctors reading the same
  // thread each see the other one named here.
  const other =
    isPopulated(referral.fromDoctor) && referral.fromDoctor._id !== user?.id
      ? referral.fromDoctor
      : isPopulated(referral.toDoctor)
        ? referral.toDoctor
        : null

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          <MessageSquare className="size-4" /> Messages
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[80vh] flex-col">
        <DialogHeader>
          <DialogTitle>{other ? `Dr. ${other.firstName} ${other.lastName}` : 'Referral messages'}</DialogTitle>
          <DialogDescription>{referral.reason}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-3 overflow-y-auto py-1">
          {isLoading &&
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-2/3" />)}

          {!isLoading && messages?.length === 0 && (
            <EmptyState icon={MessageSquare} title="No messages yet" description="Send the first message about this referral." />
          )}

          {!isLoading &&
            messages?.map((message) => {
              const fromMe = isPopulated(message.sender) ? message.sender._id === user?.id : message.sender === user?.id
              return (
                <div key={message._id} className={`flex flex-col ${fromMe ? 'items-end' : 'items-start'}`}>
                  <div
                    className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                      fromMe ? 'bg-primary text-primary-foreground' : 'bg-slate-100 text-slate-900'
                    }`}
                  >
                    {message.body}
                  </div>
                  <span className="mt-1 text-xs text-slate-600">
                    {fromMe ? 'You' : isPopulated(message.sender) ? `Dr. ${message.sender.firstName}` : ''} ·{' '}
                    {formatDateTime(message.createdAt)}
                  </span>
                </div>
              )
            })}
        </div>

        <DialogFooter className="sm:flex-col">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Write a message…"
            rows={2}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void handleSend()
              }
            }}
          />
          <Button onClick={handleSend} disabled={sendMessage.isPending || !draft.trim()} className="self-end">
            <Send className="size-4" /> Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
