import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose'

// One in-app notification for one user — the persisted record behind every
// real-time push. A notification is always created in the database FIRST,
// then (best-effort) pushed live over Socket.IO if the recipient happens to
// be connected right now — so nothing is lost if they're offline; they'll
// just see it in GET /notifications next time they load the app instead of
// getting the live popup.
const notificationSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // The Socket.IO event name this notification corresponds to, e.g.
    // 'appointment.created', 'lab.result.ready' — see config/socket.ts's
    // room-based emit pattern and notification.service.ts's notify().
    type: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    // What kind of record this notification is about (e.g. 'Appointment',
    // 'LabResult') and its id, so the frontend can deep-link to it —
    // deliberately loose typing (plain strings, not a ref) since a
    // notification can point at any collection, not just one specific model.
    entityType: { type: String, trim: true },
    entityId: { type: String, trim: true },
    // Unset (undefined) means unread; set to the time the user viewed it
    // once they mark it read. Using a nullable timestamp instead of a plain
    // boolean also records WHEN it was read, for free.
    readAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)

// Powers "this user's notifications, newest first" — the only access
// pattern this collection is ever queried by (see notification.service.ts).
notificationSchema.index({ user: 1, createdAt: -1 })

export type NotificationAttrs = InferSchemaType<typeof notificationSchema>
export type NotificationDoc = HydratedDocument<NotificationAttrs>
export const Notification = model<NotificationAttrs>('Notification', notificationSchema)
