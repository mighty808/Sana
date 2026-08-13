// `user` is populated with PUBLIC_USER_FIELDS ('firstName lastName email')
// but genuinely optional — failed-login attempts are logged with no known
// user (see models/AuditLog.ts's comment), so this must stay nullable
// rather than assumed-present.
export interface AuditLogUserRef {
  _id: string
  firstName: string
  lastName: string
  email: string
}

export interface AuditLogEntry {
  _id: string
  user?: AuditLogUserRef
  action: string
  resource: string
  resourceId?: string
  ipAddress?: string
  metadata?: Record<string, unknown>
  createdAt: string
}

export interface AuditLogResult {
  logs: AuditLogEntry[]
  total: number
  page: number
  limit: number
  pages: number
}
