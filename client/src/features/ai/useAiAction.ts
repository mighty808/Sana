import { useState } from 'react'
import { toast } from 'sonner'
import { getApiErrorMessage } from '@/lib/api'

// Used by every place that calls Sana AI: the doctor's consult, the nurse's
// vitals analysis, and the lab tech's result explanation. It wraps a
// mutation's `mutateAsync` function and handles the one thing all three
// need to do the same way: a 503 "unavailable" response is a normal,
// expected outcome (see ai.service.ts's graceful-degradation comment), not a
// generic failure. So instead of a toast message that disappears before
// anyone notices it, that case is surfaced through the `unavailable` state,
// which the UI can use to show a banner that stays visible. Every other
// kind of error still shows a normal toast.
export function useAiAction<TArgs, TResult>(mutateAsync: (args: TArgs) => Promise<TResult>) {
  const [unavailable, setUnavailable] = useState(false)

  async function run(args: TArgs): Promise<TResult | undefined> {
    setUnavailable(false)
    try {
      return await mutateAsync(args)
    } catch (err) {
      const message = getApiErrorMessage(err)
      if (message.toLowerCase().includes('unavailable')) {
        setUnavailable(true)
      } else {
        toast.error(message)
      }
      return undefined
    }
  }

  return { unavailable, run }
}
