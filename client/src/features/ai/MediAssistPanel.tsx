import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Sparkles, ShieldAlert, Check, CircleSlash, CircleDot, Activity } from 'lucide-react'
import { toast } from 'sonner'
import { useAiConsultations, useConsultAi, useReviewConsultation } from './api'
import type { AiConsultation } from '@/types/aiConsultation'
import { getApiErrorMessage } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form'

const askFormSchema = z.object({
  query: z.string().trim().min(1, 'Enter a question').max(2000),
  symptoms: z.string().trim().optional(),
})
type AskForm = z.infer<typeof askFormSchema>

const REVIEW_LABELS: Record<string, string> = {
  ACCEPTED: 'Accepted',
  PARTIALLY_ACCEPTED: 'Partially accepted',
  IGNORED: 'Ignored',
}

function ConsultationCard({ consultation, encounterId }: { consultation: AiConsultation; encounterId: string }) {
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
      {consultation.source === 'AUTO_VITALS' && (
        <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-blue-700">
          <Activity className="size-3.5" /> Auto-suggested from vitals
        </div>
      )}
      <div className="rounded-md border border-border bg-white px-3 py-2 text-sm text-slate-900">
        "{consultation.query}"
      </div>
      <div className="mt-3 space-y-2 text-sm leading-relaxed text-slate-700">
        <p>{consultation.response.diagnosticGuidance}</p>
        {consultation.response.sources && consultation.response.sources.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {consultation.response.sources.map((source) => (
              <span
                key={source.title}
                className="rounded-full border border-border bg-white px-2 py-0.5 font-mono text-[10px] text-slate-500"
              >
                {source.title}
              </span>
            ))}
          </div>
        )}
      </div>
      <p className="mt-3 flex items-start gap-1.5 border-t border-blue-200 pt-3 text-xs text-slate-500 italic">
        <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
        {consultation.response.disclaimer}
      </p>

      {consultation.reviewStatus === 'UNREVIEWED' ? (
        <div className="mt-3 space-y-2 border-t border-blue-200 pt-3">
          <Textarea
            rows={1}
            placeholder="Optional comment on this response…"
            value={commentDraft}
            onChange={(e) => setCommentDraft(e.target.value)}
            className="min-h-9 bg-white text-xs"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={reviewConsultation.isPending}
              onClick={() => handleReview('ACCEPTED')}
            >
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
      ) : (
        <div className="mt-3 border-t border-blue-200 pt-3 text-xs text-slate-500">
          <span className="font-medium text-slate-700">{REVIEW_LABELS[consultation.reviewStatus]}</span>
          {consultation.doctorComment && <span> — {consultation.doctorComment}</span>}
        </div>
      )}
    </div>
  )
}

// Doctor-only, shown inside the Encounter workspace. Never writes to the
// clinical record itself — a doctor who finds an answer useful still adds
// their own Diagnosis separately (see encounter.service.ts's addDiagnosis);
// this panel only records the question, the AI's answer, and how the
// doctor judged it.
export function MediAssistPanel({ encounterId }: { encounterId: string }) {
  const { data: consultations, isLoading } = useAiConsultations(encounterId)
  const consultAi = useConsultAi(encounterId)
  const [unavailable, setUnavailable] = useState(false)

  const form = useForm<AskForm>({ resolver: zodResolver(askFormSchema), defaultValues: { query: '', symptoms: '' } })

  async function onSubmit(values: AskForm) {
    setUnavailable(false)
    try {
      await consultAi.mutateAsync({
        query: values.query,
        symptoms: values.symptoms
          ? values.symptoms.split(',').map((s) => s.trim()).filter(Boolean)
          : undefined,
      })
      form.reset({ query: '', symptoms: '' })
    } catch (err) {
      // A 503 here is a normal, documented outcome (the AI service being
      // down doesn't affect the rest of the hospital system — see
      // ai.service.ts's graceful-degradation comment), not a generic
      // failure — shown as a persistent inline notice rather than a toast
      // that disappears before a doctor mid-consultation notices it.
      const message = getApiErrorMessage(err)
      if (message.toLowerCase().includes('unavailable')) {
        setUnavailable(true)
      } else {
        toast.error(message)
      }
    }
  }

  return (
    <Card className="border-blue-200 bg-blue-50/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4 text-blue-600" /> MediAssist AI
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && <Skeleton className="h-20 w-full" />}

        {!isLoading &&
          consultations?.map((consultation) => (
            <ConsultationCard key={consultation._id} consultation={consultation} encounterId={encounterId} />
          ))}

        {unavailable && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
            MediAssist AI is currently unavailable. Continue the consultation manually — this doesn't affect anything
            else in the record.
          </div>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-2">
            <FormField
              control={form.control}
              name="query"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Textarea
                      rows={2}
                      placeholder="Ask a clinical question about this patient…"
                      className="bg-white text-sm"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="symptoms"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Textarea
                      rows={1}
                      placeholder="Additional symptoms, comma-separated (optional)"
                      className="min-h-9 bg-white text-xs"
                      {...field}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <Button type="submit" size="sm" disabled={consultAi.isPending}>
              <Sparkles className="size-3.5" /> {consultAi.isPending ? 'Analyzing…' : 'Ask MediAssist'}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
