import { useQuery } from '@tanstack/react-query'
import { api, type ApiSuccess } from '@/lib/api'
import type { DashboardSummary } from '@/types/dashboard'

export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<DashboardSummary>>('/analytics/dashboard')
      return res.data.data
    },
    // The dashboard shows a live "what's happening right now" summary,
    // things like today's appointments and pending lab work. Refetching it
    // every time the browser window regains focus keeps it from going
    // stale if it's left open in a background tab. Most of the app's other
    // queries don't do this and just rely on the default 30-second refresh.
    refetchOnWindowFocus: true,
  })
}
