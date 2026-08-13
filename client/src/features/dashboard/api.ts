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
    // The dashboard is a live "what's happening right now" summary
    // (today's appointments, pending lab work) — refetching on every
    // window focus keeps it from going stale if left open in a background
    // tab, unlike the app's other queries which lean on the 30s default.
    refetchOnWindowFocus: true,
  })
}
