import type { Request } from 'express'
import { AuditLog } from '../models/AuditLog.js'
import { logger } from '../utils/logger.js'

// Writes one audit-log entry. Called by controllers right after a sensitive
// action succeeds (or, for failed logins, right after it fails) — per the
// blueprint's security requirement that every sensitive action records
// who did it, what they did, when, to which resource, and from which IP.
//
// `userId` is optional because some events (e.g. a failed login with an
// unknown email) happen before we know which user, if any, was involved.
//
// Deliberately never throws — this is called with `await` right before a
// controller sends its success response (or, for LOGIN_FAILURE, right before
// re-throwing the real auth error). If AuditLog.create() itself failed and
// that error were allowed to propagate, it would either turn an
// already-successful write (e.g. a patient that WAS created) into a
// client-visible 500, or — worse — replace and hide the original error
// (e.g. a clean 401 'Invalid credentials') with an unrelated 500. Audit
// logging is a side-effect of the real operation, not the operation itself,
// so a failure here is logged for an admin to notice, but never allowed to
// change the outcome the caller already committed to.
export async function logAction(
  req: Request,
  userId: string | undefined,
  action: string,
  resource: string,
  resourceId?: string,
  metadata: Record<string, unknown> = {},
) {
  try {
    await AuditLog.create({
      user: userId,
      action,
      resource,
      resourceId,
      ipAddress: req.ip,
      metadata,
    })
  } catch (err) {
    logger.error(`Failed to write audit log for action=${action} resource=${resource}`, err)
  }
}
