import type { ReactNode } from 'react'
import { Activity, AlertTriangle, FlaskConical, HeartPulse, ShieldAlert, User } from 'lucide-react'
import type { AiAcuityLevel, AiConsultation, AiConsultationSource } from '@/types/aiConsultation'

// Styling and label per acuity level. Only NURSE_VITALS_ANALYSIS
// consultations carry a level at all (see ai-service/rag/pipeline.py), so
// this badge naturally only ever shows up on the nurse's vitals analysis
// card — nothing here needs to check which screen it's rendered in.
export const ACUITY_STYLES: Record<AiAcuityLevel, { label: string; className: string }> = {
  STABLE: { label: 'Stable', className: 'border-green-300 bg-green-50 text-green-700' },
  URGENT: { label: 'Urgent', className: 'border-amber-300 bg-amber-50 text-amber-800' },
  CRITICAL: { label: 'Critical', className: 'border-red-300 bg-red-50 text-red-700' },
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
}

// This is the read-only display block that shows a question, the AI's
// guidance, its source chips, and a disclaimer. It's shared by every Sana AI
// screen: the Doctor's SanaAiPanel, the Nurse's inline vitals analysis, and
// the Lab Tech's inline result explanation. It has no outer bordered box on
// purpose, so each screen that uses it can wrap it in its own container to
// match its own layout.
export function AiResponseCard({ consultation, badge }: { consultation: AiConsultation; badge?: ReactNode }) {
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
    </>
  )
}
