import { useQuery } from '@tanstack/react-query'
import { api, type ApiSuccess } from '@/lib/api'
import type { AnalyticsTrends } from '@/types/analytics'

export function useAnalyticsTrends() {
  return useQuery({
    queryKey: ['analytics', 'trends'],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<AnalyticsTrends>>('/analytics/trends')
      return res.data.data
    },
  })
}
