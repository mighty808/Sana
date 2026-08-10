import { Notification } from '../models/Notification.js'
import { getIO } from '../config/socket.js'
import { AppError } from '../utils/apiResponse.js'
import { logger } from '../utils/logger.js'

interface NotifyInput {
  type: string
  title: string
  message: string
  entityType?: string
  entityId?: string
}

// Creates a notification for one user AND best-effort pushes it to them
// live over Socket.IO if they're currently connected. This is THE function
// every other service calls to notify someone — e.g.
// appointment.service.ts calls it when a new appointment is booked,
// labResult.service.ts calls it when a result is released.
//
// The database write always happens; the live push is deliberately
// non-fatal if it fails (e.g. Socket.IO isn't initialized, such as in a
// test environment that never called initSocket) — a notification should
// never fail to be CREATED just because nobody's listening for it live
// right now. This mirrors the same resilience reasoning as
// audit.service.ts's logAction: a secondary side-effect (the live push)
// must never break the primary operation (the notification existing at all).
export async function notify(userId: string, input: NotifyInput) {
  const notification = await Notification.create({ user: userId, ...input })

  try {
    // Emits to the `user:{id}` room every authenticated socket automatically
    // joins on connect (see config/socket.ts). Two events fire:
    // - `input.type` (e.g. 'appointment.created') lets the frontend show a
    //   specific, contextual UI for that kind of event.
    // - 'notification.created' is a generic catch-all so a notification-bell
    //   badge counter can update without needing to know every specific
    //   event type that might ever exist.
    const io = getIO()
    io.to(`user:${userId}`).emit(input.type, notification)
    io.to(`user:${userId}`).emit('notification.created', notification)
  } catch (err) {
    logger.warn(`Could not push live notification (type=${input.type}) — Socket.IO not available`, err)
  }

  return notification
}

// Lists the requesting user's own notifications, newest first. Deliberately
// not permission/role-scoped beyond "your own" — notifications are
// inherently personal, there's no "view someone else's notifications" case
// for any role, admin included.
export async function listNotifications(userId: string) {
  return Notification.find({ user: userId }).sort({ createdAt: -1 }).limit(100)
}

// Marks one notification as read. Scoped to `{ _id: id, user: userId }` in
// the query itself (not looked up by id alone and checked after) so a user
// can never mark — or even learn the existence of — another user's
// notification; a mismatch reports a plain 404, same as the ownership
// pattern established for appointments in Phase 4.
export async function markAsRead(id: string, userId: string) {
  const notification = await Notification.findOne({ _id: id, user: userId })
  if (!notification) throw new AppError('Notification not found', 404, 'NOTIFICATION_NOT_FOUND')

  // Idempotent: marking an already-read notification read again is a
  // no-op, not an error — unlike lab result release, there's no workflow
  // significance to "when" it was first read that a second call would corrupt.
  if (!notification.readAt) {
    notification.readAt = new Date()
    await notification.save()
  }
  return notification
}
