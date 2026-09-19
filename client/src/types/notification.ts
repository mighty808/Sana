import type { AppointmentDoctorRef } from './appointment'

// These are the 3 real-time event types the backend actually sends today
// (see every notify() call site: appointment.service.ts,
// labResult.service.ts, ai.service.ts). The `type` field is otherwise just
// a free-text string on the backend, but these are the only values that
// currently exist in practice.
export type NotificationType = 'appointment.created' | 'lab.result.ready' | 'ai.response.ready'

// `user` comes back as a plain id string from GET /notifications (the
// personal list — it's always "you," so there's nothing to populate), but
// as the full recipient object from GET /notifications/all (the Admin
// oversight feed — see notification.service.ts's listAllNotifications),
// the same isPopulated() pattern every other ref field in this app uses.
export interface AppNotification {
  _id: string
  user: AppointmentDoctorRef | string
  type: NotificationType | string
  title: string
  message: string
  entityType?: string
  entityId?: string
  readAt?: string
  createdAt: string
}
