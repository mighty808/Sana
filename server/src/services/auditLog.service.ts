import { AuditLog } from '../models/AuditLog.js'
import { PUBLIC_USER_FIELDS } from '../types/user.js'

interface AuditLogFilters {
  action?: string
  resource?: string
  user?: string
  page?: number
  limit?: number
}

// Lists audit log entries, newest first — the "who did what, when" trail
// the blueprint's security section requires be viewable (GET /audit-logs,
// Admin only — enforced by the route's requirePermission('auditlog.read')).
// Supports narrowing by action/resource/user for actually investigating
// something, plus the same NaN-safe pagination pattern used everywhere
// else a list endpoint accepts page/limit (see patient.service.ts's
// searchPatients for the original version of this exact defaulting logic).
export async function listAuditLogs(filters: AuditLogFilters) {
  const page = Number.isFinite(filters.page) && filters.page! > 0 ? Math.floor(filters.page!) : 1
  const limit =
    Number.isFinite(filters.limit) && filters.limit! > 0 ? Math.min(200, Math.floor(filters.limit!)) : 50

  const query: Record<string, unknown> = {}
  if (filters.action) query.action = filters.action
  if (filters.resource) query.resource = filters.resource
  if (filters.user) query.user = filters.user

  const [logs, total] = await Promise.all([
    AuditLog.find(query)
      // `user` is restricted to PUBLIC_USER_FIELDS — the same passwordHash-
      // leak concern that applies to populating a doctor on an appointment
      // (see Phase 4's review fix) applies equally here.
      .populate({ path: 'user', select: PUBLIC_USER_FIELDS })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    AuditLog.countDocuments(query),
  ])

  return { logs, total, page, limit, pages: Math.ceil(total / limit) }
}
