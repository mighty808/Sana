import { useQuery } from '@tanstack/react-query'
import { api, type ApiSuccess } from '@/lib/api'
import type { AuditLogResult } from '@/types/auditLog'

export interface AuditLogFilters {
  action?: string
  resource?: string
  page: number
  limit: number
}

export function useAuditLogs(filters: AuditLogFilters) {
  return useQuery({
    queryKey: ['audit-logs', filters],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<AuditLogResult>>('/audit-logs', {
        params: {
          page: filters.page,
          limit: filters.limit,
          action: filters.action || undefined,
          resource: filters.resource || undefined,
        },
      })
      return res.data.data
    },
    placeholderData: (prev) => prev,
  })
}
