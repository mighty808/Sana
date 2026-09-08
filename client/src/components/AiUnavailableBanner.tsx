import { ShieldAlert } from 'lucide-react'

// This is the shared amber "Sana AI is down" banner shown everywhere the AI
// feature is used (see useAiAction). The message text can be overridden,
// because SanaAiPanel needs longer, more specific wording than the shorter
// versions used by the Nurse and Lab Tech screens.
export function AiUnavailableBanner({
  message = 'Sana AI is currently unavailable — try again shortly.',
}: {
  message?: string
}) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
      <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
      {message}
    </div>
  )
}
