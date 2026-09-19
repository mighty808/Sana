import type { Request } from 'express'
import { AuditLog } from '../models/AuditLog.js'
import { logger } from '../utils/logger.js'

// Writes one audit-log entry. A controller calls this right after a
// sensitive action succeeds — or, for a failed login, right after it
// fails — so that every sensitive action leaves a record of who did it,
// what they did, when, to which resource, and from which IP address.
//
// `userId` is optional, since some events (like a failed login with an
// email that isn't even registered) happen before it's known which user,
// if any, was involved.
//
// This never throws. It's called right before a controller sends its
// success response (or, for a failed login, right before the real auth
// error gets re-thrown). If writing the audit log itself failed and that
// error were allowed to bubble up, it would either turn an
// already-successful action (like a patient that really was created) into
// a client-facing 500 error, or — worse — hide the real error (like a
// clean "invalid credentials" message) behind an unrelated 500. Writing
// the audit log is a side-effect of the real action, not the action
// itself, so if it fails, that failure is logged for an admin to notice
// later, but it never changes what the caller already sees as the result.
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
