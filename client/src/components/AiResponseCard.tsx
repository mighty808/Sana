import type { ReactNode } from 'react'
import { Activity, AlertTriangle, FlaskConical, HeartPulse, Plus, ShieldAlert, Stethoscope, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type {
  AiAcuityLevel,
  AiConsultation,
  AiConsultationSource,
  AiDifferential,
  AiDifferentialConfidence,
} from '@/types/aiConsultation'

// Styling and label per acuity level. Only NURSE_VITALS_ANALYSIS
// consultations carry a level at all (see ai-service/rag/pipeline.py), so
// this badge naturally only ever shows up on the nurse's vitals analysis
// card — nothing here needs to check which screen it's rendered in.
export const ACUITY_STYLES: Record<AiAcuityLevel, { label: string; className: string }> = {
  STABLE: { label: 'Stable', className: 'border-green-300 bg-green-50 text-green-700' },
  URGENT: { label: 'Urgent', className: 'border-amber-300 bg-amber-50 text-amber-800' },
  CRITICAL: { label: 'Critical', className: 'border-red-300 bg-red-50 text-red-700' },
}

// Styling per differential-confidence level. Kept separate from
// ACUITY_STYLES even though the color logic is similar, because these mean
// different things — acuity is a single severity read for the whole
// patient, this is "how well-supported is this one candidate diagnosis".
export const DIFFERENTIAL_CONFIDENCE_STYLES: Record<AiDifferentialConfidence, { label: string; className: string }> = {
  HIGH: { label: 'High confidence', className: 'border-blue-300 bg-blue-50 text-blue-700' },
  MODERATE: { label: 'Moderate confidence', className: 'border-slate-300 bg-slate-50 text-slate-700' },
  LOW: { label: 'Low confidence', className: 'border-slate-200 bg-slate-50 text-slate-500' },
}

// Who actually asked, and with what icon/color — shown on every
// consultation so the doctor's shared history (which mixes their own
// questions with the nurse's vitals checks, the lab tech's result
// explanations, and the system's own auto-suggestion) never leaves it
// ambiguous which role is behind a given entry.
const SOURCE_LABELS: Record<AiConsultationSource, { label: string; icon: typeof User; className: string }> = {
  MANUAL: { label: "Doctor's question", icon: User, className: 'text-blue-700' },
  AUTO_VITALS: { label: 'Auto-suggested from vitals', icon: Activity, className: 'text-blue-700' },
  NURSE_VITALS_ANALYSIS: { label: "Nurse's vitals check", icon: HeartPulse, className: 'text-teal-700' },
  LABTECH_RESULT_ANALYSIS: { label: "Lab tech's result explanation", icon: FlaskConical, className: 'text-purple-700' },
  DOCTOR_DIFFERENTIAL_DIAGNOSIS: {
    label: "Doctor's differential diagnosis request",
    icon: Stethoscope,
    className: 'text-indigo-700',
  },
}

// This is the read-only display block that shows a question, the AI's
// guidance, its source chips, and a disclaimer. It's shared by every Sana AI
// screen: the Doctor's SanaAiPanel, the Nurse's inline vitals analysis, and
// the Lab Tech's inline result explanation. It has no outer bordered box on
// purpose, so each screen that uses it can wrap it in its own container to
// match its own layout.
export function AiResponseCard({
  consultation,
  badge,
  onAcceptDifferential,
}: {
  consultation: AiConsultation
  badge?: ReactNode
  // Only meaningful on a DOCTOR_DIFFERENTIAL_DIAGNOSIS consultation — every
  // other source never sets response.differentials, so the "Add as
  // diagnosis" button below never renders for them regardless of whether a
  // caller passes this prop. Left undefined by every screen except the
  // doctor's differential-diagnosis one, which is what keeps this otherwise
  // read-only card free of mutation logic by default.
  onAcceptDifferential?: (differential: AiDifferential) => void
}) {
  const source = SOURCE_LABELS[consultation.source]
  return (
    <>
      {badge ?? (
        <div className={`mb-2 flex items-center gap-1.5 text-xs font-medium ${source.className}`}>
          <source.icon className="size-3.5" /> {source.label}
        </div>
      )}
      {consultation.response.acuityLevel && (
        <div
          className={`mb-2 flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-xs font-medium ${ACUITY_STYLES[consultation.response.acuityLevel].className}`}
        >
          <AlertTriangle className="size-3.5 shrink-0" />
          <span>{ACUITY_STYLES[consultation.response.acuityLevel].label}</span>
          {consultation.response.acuityReasons && consultation.response.acuityReasons.length > 0 && (
            <span className="font-normal opacity-90">— {consultation.response.acuityReasons.join('; ')}</span>
          )}
        </div>
      )}
      <div className="rounded-md border border-border bg-white px-3 py-2 text-sm text-slate-900">
        "{consultation.query}"
      </div>
      {consultation.response.differentials && consultation.response.differentials.length > 0 && (
        <ol className="mt-3 space-y-2">
          {consultation.response.differentials.map((differential, index) => (
            <li key={`${differential.condition}-${index}`} className="rounded-md border border-border bg-white px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900">
                    {index + 1}. {differential.condition}
                  </span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${DIFFERENTIAL_CONFIDENCE_STYLES[differential.confidence].className}`}
                  >
                    {DIFFERENTIAL_CONFIDENCE_STYLES[differential.confidence].label}
                  </span>
                </div>
                {onAcceptDifferential && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="border-blue-300 text-blue-700"
                    onClick={() => onAcceptDifferential(differential)}
                  >
                    <Plus className="size-3.5" /> Add as diagnosis
                  </Button>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-600">{differential.reasoning}</p>
            </li>
          ))}
        </ol>
      )}
      <div className="mt-3 space-y-2 text-sm leading-relaxed text-slate-700">
        {/* max-w-prose keeps each line of text at a readable length (about
            65 characters). Without it, this text would stretch to fill
            whatever width its parent container happens to give it, which
            varies a lot between the 3 places this card is used (a wide
            column versus a narrow dialog box), so the text would look
            inconsistent from one screen to the next. */}
        <p className="max-w-prose">{consultation.response.diagnosticGuidance}</p>
        {consultation.response.sources && consultation.response.sources.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {/* Two visually distinct states, because these chips make a claim
                about where the answer came from. A passage is returned
                whenever it is among the nearest matches, but only the ones
                that cleared the relevance threshold were actually put in
                front of the model — and showing both identically tells the
                doctor the AI read something it never saw.

                `grounded === false` rather than `!grounded`: the field is
                absent on consultations saved before it existed, and an
                unknown provenance should render as the normal chip rather
                than be asserted as "not used". */}
            {consultation.response.sources.map((source) => (
              <span
                key={source.title}
                title={
                  source.grounded === false
                    ? 'Related match — below the relevance threshold, so it was not used in this answer'
                    : undefined
                }
                className={
                  source.grounded === false
                    ? 'rounded-full border border-dashed border-border bg-transparent px-2 py-0.5 font-mono text-[10px] text-slate-600 italic'
                    : 'rounded-full border border-border bg-white px-2 py-0.5 font-mono text-[10px] text-slate-600'
                }
              >
                {source.title}
                {source.grounded === false && ' (not used)'}
              </span>
            ))}
          </div>
        )}
      </div>
      <p className="mt-3 flex items-start gap-1.5 border-t border-blue-200 pt-3 text-xs text-slate-600 italic">
        <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
        {consultation.response.disclaimer}
      </p>
    </>
  )
}
