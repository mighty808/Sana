import type { Request, Response } from 'express'
import * as notificationService from '../services/notification.service.js'
import { ok } from '../utils/apiResponse.js'

// GET /notifications — requires 'notification.read' (every role holds this
// by default). Always scoped to the caller's own notifications only.
export async function list(req: Request, res: Response) {
  const notifications = await notificationService.listNotifications(req.user!.id)
  return ok(res, notifications)
}

// PATCH /notifications/:id/read — requires 'notification.read'.
export async function markAsRead(req: Request, res: Response) {
  const notification = await notificationService.markAsRead(req.params.id as string, req.user!.id)
  return ok(res, notification)
}
