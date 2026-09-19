import { useState } from 'react'
import { Check, CircleSlash, CircleDot, ChevronDown, type LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import { useReviewConsultation } from './api'
import type { AiConsultation } from '@/types/aiConsultation'
import { getApiErrorMessage } from '@/lib/api'
import { AiResponseCard } from '@/components/AiResponseCard'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

const REVIEW_LABELS: Record<string, string> = {
  ACCEPTED: 'Accepted',
  PARTIALLY_ACCEPTED: 'Partially accepted',
  IGNORED: 'Ignored',
}

// `reviewable` controls whether the accept/partially-accept/ignore controls
// show at all — only a doctor reviews AI answers (see ai.service.ts), so the
// nurse's and lab tech's own read-only history views pass reviewable={false}.
// A consultation a doctor already reviewed still shows that status line
// either way, since that's just information, not a control.
export function ConsultationCard({
  consultation,
  encounterId,
  reviewable = true,
}: {
  consultation: AiConsultation
  encounterId: string
  reviewable?: boolean
}) {
  const reviewConsultation = useReviewConsultation(encounterId)
  const [commentDraft, setCommentDraft] = useState('')

  async function handleReview(reviewStatus: 'ACCEPTED' | 'PARTIALLY_ACCEPTED' | 'IGNORED') {
    try {
      await reviewConsultation.mutateAsync({ id: consultation._id, reviewStatus, doctorComment: commentDraft || undefined })
      toast.success(`Marked ${REVIEW_LABELS[reviewStatus].toLowerCase()}`)
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-4">
      <AiResponseCard consultation={consultation} />

      {reviewable && consultation.reviewStatus === 'UNREVIEWED' && (
        <div className="mt-3 space-y-2 border-t border-blue-200 pt-3">
          <Textarea
            rows={1}
            placeholder="Optional comment on this response…"
            value={commentDraft}
            onChange={(e) => setCommentDraft(e.target.value)}
            className="min-h-9 bg-white text-xs"
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={reviewConsultation.isPending} onClick={() => handleReview('ACCEPTED')}>
              <Check className="size-3.5" /> Accept
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={reviewConsultation.isPending}
              className="border-blue-300 text-blue-700"
              onClick={() => handleReview('PARTIALLY_ACCEPTED')}
            >
              <CircleDot className="size-3.5" /> Partially accept
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={reviewConsultation.isPending}
              className="text-slate-600"
              onClick={() => handleReview('IGNORED')}
            >
              <CircleSlash className="size-3.5" /> Ignore
            </Button>
          </div>
        </div>
      )}

      {consultation.reviewStatus !== 'UNREVIEWED' && (
        <div className="mt-3 border-t border-blue-200 pt-3 text-xs text-slate-600">
          <span className="font-medium text-slate-700">{REVIEW_LABELS[consultation.reviewStatus]}</span>
          {consultation.doctorComment && <span> — {consultation.doctorComment}</span>}
        </div>
      )}
    </div>
  )
}

// One collapsible dropdown per group of consultations — closed by default,
// so a history starts as just a "Label (N)"-style row instead of every past
// consultation rendered open at once. Clicking the header expands it.
// `open`/`onOpenChange` make this optionally controlled: pass both when the
// caller wants to force it open itself (e.g. right after a fresh result
// comes in); omit them and it manages its own open/closed state.
export function CollapsibleConsultationGroup({
  label,
  icon: Icon,
  iconClassName = 'text-blue-700',
  items,
  encounterId,
  reviewable = true,
  defaultOpen = false,
  open: openProp,
  onOpenChange,
}: {
  label: string
  icon: LucideIcon
  iconClassName?: string
  items: AiConsultation[]
  encounterId: string
  reviewable?: boolean
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen)
  const open = openProp ?? internalOpen
  const toggle = () => (onOpenChange ? onOpenChange(!open) : setInternalOpen((o) => !o))

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50/60">
      <button type="button" onClick={toggle} className="flex w-full items-center gap-2 px-3 py-2.5 text-left">
        <Icon className={`size-4 shrink-0 ${iconClassName}`} />
        <span className="flex-1 text-sm font-medium text-slate-900">
          {label} <span className="font-normal text-slate-600">({items.length})</span>
        </span>
        <ChevronDown className={`size-4 shrink-0 text-slate-600 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="max-h-48 space-y-3 overflow-y-auto border-t border-blue-200 p-3 pt-3">
          {items.map((consultation) => (
            <ConsultationCard
              key={consultation._id}
              consultation={consultation}
              encounterId={encounterId}
              reviewable={reviewable}
            />
          ))}
        </div>
      )}
    </div>
  )
}
