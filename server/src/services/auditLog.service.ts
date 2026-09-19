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
// that GET /audit-logs shows an Admin (only an Admin can reach this, via
// the route's requirePermission('auditlog.read')). This can be narrowed
// down by action, resource, or user when actually investigating
// something, and uses the same safe pagination every other list endpoint uses.
export async function listAuditLogs(filters: AuditLogFilters) {
  // If a `user` filter is given, it has to be a real, valid id. Without
  // this check, a bad value (a typo, say) would reach Mongoose as a raw
  // error and come back as an unhandled 500, instead of the clean 400
  // every other id-taking endpoint gives through this same helper.
  if (filters.user) assertValidObjectId(filters.user, 'user')

  const { page, limit, skip } = resolvePagination(filters, { maxLimit: 200 })

  const query: Record<string, unknown> = {}
  if (filters.action) query.action = filters.action
  if (filters.resource) query.resource = filters.resource
  if (filters.user) query.user = filters.user

  const [logs, total] = await Promise.all([
    AuditLog.find(query)
      // Only the public fields of `user` are populated here, so this
      // never accidentally sends back a password hash — the same concern
      // that applies whenever a doctor gets populated onto an appointment.
      .populate({ path: 'user', select: PUBLIC_USER_FIELDS })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    AuditLog.countDocuments(query),
  ])

  return { logs, total, page, limit, pages: Math.ceil(total / limit) }
}
