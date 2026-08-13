// Mirrors server/src/types/permissions.ts's PERMISSIONS array exactly —
// kept as plain strings (not re-derived from any shared package, since the
// client and server are separate deployables) so route guards can compare
// against the same permission strings the backend's own `requirePermission`
// middleware checks.
export type Permission =
  | 'user.manage'
  | 'department.manage'
  | 'patient.create'
  | 'patient.read'
  | 'patient.update'
  | 'appointment.create'
  | 'appointment.read'
  | 'appointment.update'
  | 'encounter.create'
  | 'encounter.read'
  | 'encounter.complete'
  | 'vitals.create'
  | 'diagnosis.create'
  | 'laborder.create'
  | 'laborder.read'
  | 'labresult.create'
  | 'labresult.release'
  | 'labresult.read'
  | 'ai.consult'
  | 'ai.review'
  | 'invoice.create'
  | 'invoice.read'
  | 'payment.create'
  | 'notification.read'
  | 'analytics.read'
  | 'auditlog.read'

export type RoleName = 'ADMIN' | 'DOCTOR' | 'NURSE' | 'PATIENT' | 'LAB_TECH'

export interface Role {
  _id: string
  name: RoleName
  permissions: Permission[]
}

// Matches server/src/services/auth.service.ts's toPublicUser() output —
// deliberately excludes anything sensitive (passwordHash, tokenVersion),
// since that's exactly what the backend already strips before this ever
// reaches the client.
export interface AuthUser {
  id: string
  email: string
  firstName: string
  lastName: string
  phone?: string
  role: Role
  status: 'ACTIVE' | 'INACTIVE'
  lastLoginAt?: string
}
