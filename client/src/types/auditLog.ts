// `user` is filled in with PUBLIC_USER_FIELDS ('firstName lastName email'),
// but it's genuinely optional: failed-login attempts get logged even when
// there's no known user (see models/AuditLog.ts's comment), so this field
// has to allow being empty rather than always being assumed present.
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
