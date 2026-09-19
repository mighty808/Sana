import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Sparkles, User, Activity, HeartPulse, FlaskConical } from 'lucide-react'
import { useAiConsultations, useConsultAi } from './api'
import { useAiAction } from './useAiAction'
import { CollapsibleConsultationGroup } from './ConsultationGroup'
import type { AiConsultationSource } from '@/types/aiConsultation'
import { AiUnavailableBanner } from '@/components/AiUnavailableBanner'
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

// Which role's questions show first, and how that role's dropdown header
// is labeled/iconed. Doctor's own questions lead since this panel is the
// doctor's own workspace; the rest follow in the order they'd typically
// happen during a visit (nurse's vitals check, lab tech's result, then the
// system's own auto-suggestion).
const GROUP_ORDER: AiConsultationSource[] = ['MANUAL', 'NURSE_VITALS_ANALYSIS', 'LABTECH_RESULT_ANALYSIS', 'AUTO_VITALS']
const GROUP_LABELS: Record<AiConsultationSource, { label: string; icon: typeof User; className: string }> = {
  MANUAL: { label: 'Doctor', icon: User, className: 'text-blue-700' },
  NURSE_VITALS_ANALYSIS: { label: 'Nurse', icon: HeartPulse, className: 'text-teal-700' },
  LABTECH_RESULT_ANALYSIS: { label: 'Lab Tech', icon: FlaskConical, className: 'text-purple-700' },
  AUTO_VITALS: { label: 'Auto-suggested', icon: Activity, className: 'text-blue-700' },
}

// This panel is for doctors only, and is shown inside the Encounter
// workspace. It never writes anything to the clinical record on its own —
// if a doctor finds the AI's answer useful, they still have to add their own
// Diagnosis entry separately (see encounter.service.ts's addDiagnosis). This
// panel just keeps a record of the question that was asked, the AI's
// answer, and how the doctor judged that answer afterward.
export function SanaAiPanel({ encounterId }: { encounterId: string }) {
  const { data: consultations, isLoading } = useAiConsultations(encounterId)
  const consultAi = useConsultAi(encounterId)
  // A 503 response here is a normal, expected outcome, not a generic error.
  // If the AI service is down it doesn't affect the rest of the hospital
  // system (see ai.service.ts's graceful-degradation comment). Because of
  // that, it's shown as a banner that stays on screen (via useAiAction's
  // `unavailable` state) instead of a toast message that would disappear
  // before a doctor mid-consultation even notices it.
  const { unavailable, run } = useAiAction(consultAi.mutateAsync)

  const form = useForm<AskForm>({ resolver: zodResolver(askFormSchema), defaultValues: { query: '', symptoms: '' } })

  async function onSubmit(values: AskForm) {
    const result = await run({
      query: values.query,
      symptoms: values.symptoms ? values.symptoms.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
    })
    if (result) form.reset({ query: '', symptoms: '' })
  }

  return (
    <Card className="border-blue-200 bg-blue-50/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4 text-blue-600" /> Sana AI
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && <Skeleton className="h-20 w-full" />}

        {!isLoading && consultations && consultations.length > 0 && (
          <div className="space-y-2">
            {GROUP_ORDER.map((source) => {
              const items = consultations.filter((c) => c.source === source)
              const group = GROUP_LABELS[source]
              return (
                items.length > 0 && (
                  <CollapsibleConsultationGroup
                    key={source}
                    label={group.label}
                    icon={group.icon}
                    iconClassName={group.className}
                    items={items}
                    encounterId={encounterId}
                  />
                )
              )
            })}
          </div>
        )}

        {unavailable && (
          <AiUnavailableBanner message="Sana AI is currently unavailable. Continue the consultation manually — this doesn't affect anything else in the record." />
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
              <Sparkles className="size-3.5" /> {consultAi.isPending ? 'Analyzing…' : 'Ask Sana AI'}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
