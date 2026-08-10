import type { Request } from 'express'
import { AuditLog } from '../models/AuditLog.js'

// Writes one audit-log entry. Called by controllers right after a sensitive
// action succeeds (or, for failed logins, right after it fails) — per the
// blueprint's security requirement that every sensitive action records
// who did it, what they did, when, to which resource, and from which IP.
//
// `userId` is optional because some events (e.g. a failed login with an
// unknown email) happen before we know which user, if any, was involved.
export async function logAction(
  req: Request,
  userId: string | undefined,
  action: string,
  resource: string,
  resourceId?: string,
  metadata: Record<string, unknown> = {},
) {
  await AuditLog.create({
    user: userId,
    action,
    resource,
    resourceId,
    ipAddress: req.ip,
    metadata,
  })
}
