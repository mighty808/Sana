import { AuditLog } from '../models/AuditLog.js'
import { PUBLIC_USER_FIELDS } from '../types/user.js'
import { resolvePagination } from '../utils/pagination.js'
import { assertValidObjectId } from '../utils/apiResponse.js'

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
// something, plus the same NaN-safe pagination every other list endpoint
// uses (see utils/pagination.ts).
export async function listAuditLogs(filters: AuditLogFilters) {
  // `user`, if given, must be a real ObjectId — without this check, an
  // invalid value (e.g. a typo) would reach Mongoose as a raw CastError
  // (an uncaught 500) instead of the clean 400 every other id-taking
  // endpoint in the app produces via this same helper.
  if (filters.user) assertValidObjectId(filters.user, 'user')

  const { page, limit, skip } = resolvePagination(filters, { maxLimit: 200 })

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
      .skip(skip)
      .limit(limit),
    AuditLog.countDocuments(query),
  ])

  return { logs, total, page, limit, pages: Math.ceil(total / limit) }
}
