// The 3 real-time event types the backend actually fires today (see every
// notify() call site: appointment.service.ts, labResult.service.ts,
// ai.service.ts) — `type` is otherwise a free-text string server-side, but
// these are the only values that currently exist.
export type NotificationType = 'appointment.created' | 'lab.result.ready' | 'ai.response.ready'

export interface AppNotification {
  _id: string
  user: string
  type: NotificationType | string
  title: string
  message: string
  entityType?: string
  entityId?: string
  readAt?: string
  createdAt: string
}
