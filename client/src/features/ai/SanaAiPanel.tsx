import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Sparkles, User, Activity, HeartPulse, FlaskConical, Stethoscope, Maximize2 } from 'lucide-react'
import { useAiConsultations, useConsultAi, useSuggestDifferentialDiagnosis } from './api'
import { useAiAction } from './useAiAction'
import { CollapsibleConsultationGroup } from './ConsultationGroup'
import type { AiConsultationSource, AiDifferential } from '@/types/aiConsultation'
import { AiUnavailableBanner } from '@/components/AiUnavailableBanner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form'

const askFormSchema = z.object({
  query: z.string().trim().min(1, 'Enter a question').max(2000),
  symptoms: z.string().trim().optional(),
})
type AskForm = z.infer<typeof askFormSchema>

// Which role's questions show first, and how that role's dropdown header is
// labeled/iconed. Doctor's own questions lead since this panel is the
// doctor's own workspace, with the differential-diagnosis suggestions right
// after them — also doctor-initiated, and the more clinically load-bearing
// of the two doctor actions this panel now offers. The rest follow in the
// order they'd typically happen during a visit (nurse's vitals check, lab
// tech's result, then the system's own auto-suggestion).
const GROUP_ORDER: AiConsultationSource[] = [
  'MANUAL',
  'DOCTOR_DIFFERENTIAL_DIAGNOSIS',
  'NURSE_VITALS_ANALYSIS',
  'LABTECH_RESULT_ANALYSIS',
  'AUTO_VITALS',
]
const GROUP_LABELS: Record<AiConsultationSource, { label: string; icon: typeof User; className: string }> = {
  MANUAL: { label: 'Doctor', icon: User, className: 'text-blue-700' },
  NURSE_VITALS_ANALYSIS: { label: 'Nurse', icon: HeartPulse, className: 'text-teal-700' },
  LABTECH_RESULT_ANALYSIS: { label: 'Lab Tech', icon: FlaskConical, className: 'text-purple-700' },
  AUTO_VITALS: { label: 'Auto-suggested', icon: Activity, className: 'text-blue-700' },
  DOCTOR_DIFFERENTIAL_DIAGNOSIS: { label: 'Differential diagnosis', icon: Stethoscope, className: 'text-indigo-700' },
}

// This panel is for doctors only, and is shown inside the Encounter
// workspace. It never writes anything to the clinical record on its own —
// if a doctor finds the AI's answer useful, they still have to add their own
// Diagnosis entry separately (see encounter.service.ts's addDiagnosis). This
// panel just keeps a record of the question that was asked, the AI's
// answer, and how the doctor judged that answer afterward.
//
// Two distinct actions live here: a free-text question (any clinical
// question, vitals-only context) and a fixed "suggest differential
// diagnoses" request (lab results included too — see
// ai.service.ts's suggestDifferentialDiagnosis). They're separate mutations
// with separate useAiAction instances so a 503 on one doesn't block or
// mislabel the other, but they share one consultation history feed below.
// `onAcceptDifferential` is only ever populated on a
// DOCTOR_DIFFERENTIAL_DIAGNOSIS consultation's response — see
// AiResponseCard's own comment on this prop — and is threaded down to
// prefill EncounterPage's AddDiagnosisForm; Sana AI still never writes to
// the clinical record on its own.
export function SanaAiPanel({
  encounterId,
  onAcceptDifferential,
}: {
  encounterId: string
  onAcceptDifferential?: (differential: AiDifferential) => void
}) {
  const { data: consultations, isLoading } = useAiConsultations(encounterId)
  const consultAi = useConsultAi(encounterId)
  // A 503 response here is a normal, expected outcome, not a generic error.
  // If the AI service is down it doesn't affect the rest of the hospital
  // system (see ai.service.ts's graceful-degradation comment). Because of
  // that, it's shown as a banner that stays on screen (via useAiAction's
  // `unavailable` state) instead of a toast message that would disappear
  // before a doctor mid-consultation even notices it.
  const { unavailable, run } = useAiAction(consultAi.mutateAsync)

  const suggestDifferential = useSuggestDifferentialDiagnosis()
  const { unavailable: differentialUnavailable, run: runDifferential } = useAiAction(suggestDifferential.mutateAsync)
  const [differentialNotes, setDifferentialNotes] = useState('')
  // Forces the differential-diagnosis history group open right after a
  // fresh suggestion comes in, same as every other group's default-closed
  // dropdown otherwise leaves it. Every other group in GROUP_ORDER stays
  // uncontrolled (manages its own open state) — only this one is ever
  // passed `open`/`onOpenChange` below.
  const [differentialHistoryOpen, setDifferentialHistoryOpen] = useState(false)
  // Whether the panel is shown in the large pop-up instead of inline. The
  // right-hand column of the Encounter page is narrow, and long AI answers
  // get cramped in it, so the doctor can expand the whole panel into a dialog.
  const [expanded, setExpanded] = useState(false)

  const form = useForm<AskForm>({ resolver: zodResolver(askFormSchema), defaultValues: { query: '', symptoms: '' } })

  async function onSubmit(values: AskForm) {
    const result = await run({
      query: values.query,
      symptoms: values.symptoms ? values.symptoms.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
    })
    if (result) form.reset({ query: '', symptoms: '' })
  }

  async function handleSuggestDifferential() {
    const result = await runDifferential({ encounter: encounterId, notes: differentialNotes || undefined })
    if (result) setDifferentialHistoryOpen(true)
  }

  // The two halves of the panel are built once here and placed either inline
  // (stacked, in the narrow column) or inside the expanded dialog (side by
  // side). Only one placement is ever mounted at a time, and all the state —
  // the form, both mutations, the unavailable banners — lives in this
  // component rather than in these fragments, so expanding or collapsing
  // keeps whatever the doctor has typed and any request still in flight.
  const history = (
    <>
      {isLoading && <Skeleton className="h-20 w-full" />}

      {!isLoading && consultations && consultations.length > 0 && (
        <div className="space-y-2">
          {GROUP_ORDER.map((source) => {
            const items = consultations.filter((c) => c.source === source)
            const group = GROUP_LABELS[source]
            const isDifferential = source === 'DOCTOR_DIFFERENTIAL_DIAGNOSIS'
            return (
              items.length > 0 && (
                <CollapsibleConsultationGroup
                  key={source}
                  label={group.label}
                  icon={group.icon}
                  iconClassName={group.className}
                  items={items}
                  encounterId={encounterId}
                  onAcceptDifferential={onAcceptDifferential}
                  // In the pop-up the answers are the point, so groups start
                  // open and drop the compact inline height cap. This history
                  // is only mounted in one place at a time, so `expanded` is
                  // read fresh each time it appears.
                  defaultOpen={expanded}
                  bodyClassName={expanded ? '' : undefined}
                  {...(isDifferential
                    ? { open: differentialHistoryOpen, onOpenChange: setDifferentialHistoryOpen }
                    : {})}
                />
              )
            )
          })}
        </div>
      )}
    </>
  )

  const controls = (
    <>
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
          {unavailable && (
            <AiUnavailableBanner message="Sana AI is currently unavailable. Continue the consultation manually — this doesn't affect anything else in the record." />
          )}
          <Button type="submit" size="sm" disabled={consultAi.isPending}>
            <Sparkles className="size-3.5" /> {consultAi.isPending ? 'Analyzing…' : 'Ask Sana AI'}
          </Button>
        </form>
      </Form>

      <div className="space-y-2 border-t border-blue-200 pt-4">
        <Textarea
          rows={1}
          placeholder="Optional notes to include (optional)…"
          value={differentialNotes}
          onChange={(e) => setDifferentialNotes(e.target.value)}
          className="min-h-9 bg-white text-xs"
        />
        {differentialUnavailable && <AiUnavailableBanner />}
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={suggestDifferential.isPending}
          onClick={handleSuggestDifferential}
        >
          <Stethoscope className="size-3.5" /> {suggestDifferential.isPending ? 'Thinking…' : 'Suggest differential diagnoses'}
        </Button>
      </div>
    </>
  )

  const title = (
    <>
      <Sparkles className="size-4 text-blue-600" /> Sana Differential Decision Tool
    </>
  )

  return (
    <>
      <Card className="border-blue-200 bg-blue-50/30">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">{title}</CardTitle>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Expand Sana Differential Decision Tool"
            title="Expand"
            onClick={() => {
              setExpanded(true)
              // That group is controlled by state rather than defaultOpen, so
              // open it explicitly to match the others.
              setDifferentialHistoryOpen(true)
            }}
          >
            <Maximize2 className="size-4" />
          </Button>
        </CardHeader>
        {/* While the dialog is open the panel's content is mounted there, so
            the inline card holds a short note instead of a second copy. */}
        <CardContent className="space-y-4">
          {expanded ? (
            <p className="text-sm text-muted-foreground">Open in the expanded view.</p>
          ) : (
            <>
              {history}
              {controls}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={expanded} onOpenChange={setExpanded}>
        {/* Flex column with a fixed height so the header stays put and the two
            columns below scroll on their own. `sm:max-w-5xl` overrides the
            dialog's default `sm:max-w-lg`. */}
        <DialogContent className="flex h-[85vh] flex-col sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">{title}</DialogTitle>
            <DialogDescription className="sr-only">
              Ask Sana AI a question or request differential diagnoses, and review earlier answers.
            </DialogDescription>
          </DialogHeader>
          {/* One scrolling column on phones; from `md` up, two columns that
              each scroll independently — what to ask on the left, the answers
              on the right where they get the room. */}
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto md:grid md:grid-cols-2 md:gap-6 md:space-y-0 md:overflow-hidden">
            <div className="space-y-4 md:min-h-0 md:overflow-y-auto md:pr-1">{controls}</div>
            <div className="space-y-4 md:min-h-0 md:overflow-y-auto md:pr-1">{history}</div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
