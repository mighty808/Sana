import { Link } from 'react-router-dom'
import { ArrowUpRight, Send } from 'lucide-react'
import { toast } from 'sonner'
import { useIncomingReferrals, useOutgoingReferrals, useUpdateReferralStatus, referralHasUnread } from './api'
import { ReferralMessagesDialog } from './ReferralMessagesDialog'
import { useNotifications } from '@/features/notifications/api'
import type { AppNotification } from '@/types/notification'
import type { Referral } from '@/types/referral'
import { isPopulated } from '@/lib/utils'
import { getApiErrorMessage } from '@/lib/api'
import { formatDateTime } from '@/lib/date'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/StatusBadge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/EmptyState'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

// Advances a referral one step (PENDING -> ACKNOWLEDGED -> COMPLETED). This
// only ever moves it forward, never back — there's no "un-acknowledge", since
// once you've seen it, you've seen it.
//
// Deliberately absent from the Sent tab: updateReferralStatus scopes its query
// to `toDoctor`, so only the receiving doctor can move a referral along.
// Showing this to the sender would be a button that always 404s.
function AdvanceReferralButton({ referral }: { referral: Referral }) {
  const updateStatus = useUpdateReferralStatus()
  const next = referral.status === 'PENDING' ? 'ACKNOWLEDGED' : referral.status === 'ACKNOWLEDGED' ? 'COMPLETED' : null
  if (!next) return null

  async function handleClick() {
    try {
      await updateStatus.mutateAsync({ id: referral._id, status: next! })
      toast.success(`Referral marked ${next!.toLowerCase()}`)
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  return (
    <Button size="sm" variant="outline" disabled={updateStatus.isPending} onClick={handleClick}>
      Mark {next.toLowerCase()}
    </Button>
  )
}

// One table shared by both tabs. The only differences are which doctor is
// worth naming (the sender on incoming, the recipient on sent) and whether the
// status can be advanced from here — so those are props rather than a second
// near-identical copy of the markup.
function ReferralsTable({
  referrals,
  isLoading,
  notifications,
  direction,
}: {
  referrals: Referral[] | undefined
  isLoading: boolean
  notifications: AppNotification[] | undefined
  direction: 'incoming' | 'sent'
}) {
  const isIncoming = direction === 'incoming'

  return (
    <div className="rounded-lg border border-border bg-card shadow-sm">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50 hover:bg-slate-50">
            <TableHead>Patient</TableHead>
            <TableHead>{isIncoming ? 'From' : 'To'}</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Sent</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading &&
            Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: 6 }).map((__, j) => (
                  <TableCell key={j}>
                    <Skeleton className="h-4 w-20" />
                  </TableCell>
                ))}
              </TableRow>
            ))}

          {!isLoading &&
            referrals?.map((referral) => {
              const counterpart = isIncoming ? referral.fromDoctor : referral.toDoctor
              return (
                <TableRow key={referral._id}>
                  <TableCell className="font-medium text-slate-900">
                    <span className="flex items-center gap-2">
                      {referralHasUnread(notifications, referral._id) && (
                        <span className="size-1.5 shrink-0 rounded-full bg-blue-600" aria-label="Unread" />
                      )}
                      {isPopulated(referral.patient) ? `${referral.patient.firstName} ${referral.patient.lastName}` : '—'}
                    </span>
                  </TableCell>
                  <TableCell className="text-slate-600">
                    {isPopulated(counterpart) ? `Dr. ${counterpart.firstName} ${counterpart.lastName}` : '—'}
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-slate-600">{referral.reason}</TableCell>
                  <TableCell>
                    <StatusBadge status={referral.status} />
                  </TableCell>
                  <TableCell className="text-xs text-slate-600">{formatDateTime(referral.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {isIncoming && <AdvanceReferralButton referral={referral} />}
                      <ReferralMessagesDialog referral={referral} />
                      <Button asChild size="sm" variant="ghost">
                        <Link to={`/encounters/${referral.encounter}`}>
                          Open encounter <ArrowUpRight className="size-4" />
                        </Link>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
        </TableBody>
      </Table>

      {!isLoading && referrals?.length === 0 && (
        <EmptyState
          icon={Send}
          title={isIncoming ? 'No referrals' : 'Nothing referred out yet'}
          description={
            isIncoming
              ? 'Referrals other doctors send you will show up here.'
              : 'Patients you refer to another doctor will show up here.'
          }
        />
      )}
    </div>
  )
}

export function ReferralsPage() {
  const { data: incoming, isLoading: incomingLoading } = useIncomingReferrals()
  const { data: sent, isLoading: sentLoading } = useOutgoingReferrals()
  // Already fetched and cached by AppShell for the sidebar badge — reading it
  // again here is free (same query key), just narrowed per-row.
  const { data: notifications } = useNotifications()

  return (
    <Tabs defaultValue="incoming" className="space-y-4">
      <TabsList>
        <TabsTrigger value="incoming">Incoming</TabsTrigger>
        <TabsTrigger value="sent">Sent</TabsTrigger>
      </TabsList>

      <TabsContent value="incoming" className="space-y-4">
        <p className="text-sm text-slate-600">Referrals other doctors have sent to you.</p>
        <ReferralsTable
          referrals={incoming}
          isLoading={incomingLoading}
          notifications={notifications}
          direction="incoming"
        />
      </TabsContent>

      <TabsContent value="sent" className="space-y-4">
        <p className="text-sm text-slate-600">Patients you've referred to another doctor.</p>
        <ReferralsTable referrals={sent} isLoading={sentLoading} notifications={notifications} direction="sent" />
      </TabsContent>
    </Tabs>
  )
}
