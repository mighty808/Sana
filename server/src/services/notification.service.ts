import { Notification } from '../models/Notification.js'
import { getIO } from '../config/socket.js'
import { AppError } from '../utils/apiResponse.js'
import { logger } from '../utils/logger.js'
import { PUBLIC_USER_FIELDS } from '../types/user.js'

interface NotifyInput {
  type: string
  title: string
  message: string
  entityType?: string
  entityId?: string
}

// Creates a notification for one user, and also tries to push it to them
// live over Socket.IO if they happen to be connected right now. This is
// the one function every other service calls to notify someone —
// appointment.service.ts calls it when a new appointment is booked,
// labResult.service.ts calls it when a result is released — always after
// their own main write (the appointment, the result) has already saved successfully.
//
// The whole function, including the database write, is wrapped in one
// try/catch and never throws. audit.service.ts's logAction does the same
// thing for the same reason: sending a notification is a side-effect of
// something else that already succeeded, so if this fails — a brief
// database hiccup, Socket.IO not being set up, anything — it must never
// turn an already-successful appointment booking or lab-result release
// into an error the caller sees. If the database write itself fails,
// there's no notification document to hand back, which is why the return
// type includes `| null` — though nothing that calls this today actually
// uses the return value; they just call it and let it do its thing.
export async function notify(userId: string, input: NotifyInput) {
  try {
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
      // Every socket auto-joins a `role:{ROLE}` room on connect (see
      // config/socket.ts's initSocket) — piggybacking on that lets Admin's
      // oversight view (see listAllNotifications below) live-update the
      // same way the recipient's own bell does, with no new room-management
      // code and no cost when no Admin happens to be connected.
      io.to('role:ADMIN').emit('notification.created.any', notification)
    } catch (err) {
      // Socket.IO not initialized (e.g. a test context) or a mid-emit
      // error — the notification document itself was already saved above,
      // so this inner failure only means the live push didn't go out; the
      // recipient will still see it next time they load GET /notifications.
      logger.warn(`Could not push live notification (type=${input.type}) — Socket.IO not available`, err)
    }

    return notification
  } catch (err) {
    logger.error(`Failed to create notification (type=${input.type}, user=${userId})`, err)
    return null
  }
}

// Lists the requesting user's own notifications, newest first. This isn't
// scoped by role beyond "your own" — notifications are personal to
// whoever they were sent to, and there's no case where any role, admin
// included, needs to view someone else's.
export async function listNotifications(userId: string) {
  return Notification.find({ user: userId }).sort({ createdAt: -1 }).limit(100)
}

// Admin-only oversight feed — every notification sent to every user, not
// scoped to the caller (see notification.routes.ts's 'notification.readAll'
// gate). `user` is populated here, unlike listNotifications above, because
// the personal list never needs to say who it belongs to — it's always
// "you" — while this one is only useful if each row says who it was for.
// Capped at 200, the same simple "recent window, no pagination" shape
// listNotifications already uses at 100.
export async function listAllNotifications() {
  return Notification.find().sort({ createdAt: -1 }).limit(200).populate('user', PUBLIC_USER_FIELDS)
}

// Marks one notification as read. The query itself checks both the
// notification's id and that it belongs to this user, rather than
// looking it up by id alone and checking ownership afterward — that way a
// user can never mark, or even learn the existence of, someone else's
// notification. A mismatch reports a plain 404, the same ownership
// pattern used for appointments.
export async function markAsRead(id: string, userId: string) {
  const notification = await Notification.findOne({ _id: id, user: userId })
  if (!notification) throw new AppError('Notification not found', 404, 'NOTIFICATION_NOT_FOUND')

  // Marking an already-read notification as read again is simply a
  // no-op, not an error — there's no meaningful record of exactly when it
  // was first read that a second call could mess up.
  if (!notification.readAt) {
    notification.readAt = new Date()
    await notification.save()
  }
  return notification
}
