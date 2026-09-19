// This matches server/src/types/permissions.ts's PERMISSIONS array exactly.
// It's kept as plain strings here rather than shared from a common package,
// since the client and server are deployed separately. That way, the
// frontend's route guards can compare against the exact same permission
// strings that the backend's own `requirePermission` middleware checks.
export type Permission =
  | 'user.manage'
  | 'user.readDoctors'
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
  | 'vitals.update'
  | 'diagnosis.create'
  | 'diagnosis.update'
  | 'referral.create'
  | 'referral.read'
  | 'referral.update'
  | 'prescription.create'
  | 'prescription.read'
  | 'prescription.dispense'
  | 'laborder.create'
  | 'laborder.update'
  | 'laborder.read'
  | 'labresult.create'
  | 'labresult.release'
  | 'labresult.read'
  | 'ai.consult'
  | 'ai.review'
  | 'ai.analyzeVitals'
  | 'ai.explainLabResult'
  | 'invoice.create'
  | 'invoice.read'
  | 'payment.create'
  | 'notification.read'
  | 'notification.readAll'
  | 'analytics.read'
  | 'analytics.readTrends'
  | 'auditlog.read'

export type RoleName = 'ADMIN' | 'DOCTOR' | 'NURSE' | 'PATIENT' | 'LAB_TECH' | 'PHARMACIST'

export interface Role {
  _id: string
  name: RoleName
  permissions: Permission[]
}

// This matches server/src/services/auth.service.ts's toPublicUser() output.
// It leaves out anything sensitive, like passwordHash or tokenVersion,
// because the backend already strips those out before this data ever
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
