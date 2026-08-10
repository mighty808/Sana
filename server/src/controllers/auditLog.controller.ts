import type { Request, Response } from 'express'
import * as auditLogService from '../services/auditLog.service.js'
import { ok } from '../utils/apiResponse.js'

// GET /audit-logs?action=&resource=&user=&page=&limit= — requires
// 'auditlog.read' (Admin only).
export async function list(req: Request, res: Response) {
  const { action, resource, user, page, limit } = req.query
  const result = await auditLogService.listAuditLogs({
    action: typeof action === 'string' ? action : undefined,
    resource: typeof resource === 'string' ? resource : undefined,
    user: typeof user === 'string' ? user : undefined,
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
  })
  return ok(res, result)
}
