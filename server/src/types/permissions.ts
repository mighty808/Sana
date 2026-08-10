// Every permission string the system understands. Adding a new protected
// action anywhere in the app means adding its permission string here first,
// then assigning it to whichever role(s) should have it below.
export const PERMISSIONS = [
  'user.manage',
  'department.manage',
  'patient.create',
  'patient.read',
  'patient.update',
  'appointment.create',
  'appointment.read',
  'appointment.update',
  'encounter.create',
  'encounter.read',
  'vitals.create',
  'diagnosis.create',
  'laborder.create',
  'laborder.read',
  'labresult.create',
  'labresult.release',
  'labresult.read',
  'ai.consult',
  'ai.review',
  'invoice.create',
  'invoice.read',
  'payment.create',
  'notification.read',
  'analytics.read',
  'auditlog.read',
] as const

// TypeScript union type derived from the array above, e.g. 'user.manage' | 'patient.create' | ...
// Using `as const` + this pattern means adding a permission to the array
// automatically updates the type everywhere it's used (rbac middleware, schemas, etc).
export type Permission = (typeof PERMISSIONS)[number]

// The 4 roles this MVP supports (see blueprint section 1.3 — more roles like
// Lab Technician/Receptionist are explicitly future work, not built now).
export const ROLE_NAMES = ['ADMIN', 'DOCTOR', 'NURSE', 'PATIENT'] as const
export type RoleName = (typeof ROLE_NAMES)[number]

// The default permission set assigned to each role when the database is seeded
// (see utils/seed.ts). This is the single source of truth for "who can do what"
// — change it here to change what a role is allowed to do system-wide.
export const DEFAULT_ROLE_PERMISSIONS: Record<RoleName, Permission[]> = {
  // Admin: manages users/departments/patients/invoices/audit logs, and also
  // handles lab entry/release since there's no separate Lab Technician role in the MVP.
  ADMIN: [
    'user.manage',
    'department.manage',
    'patient.create',
    'patient.read',
    'patient.update',
    'appointment.create',
    'appointment.read',
    'appointment.update',
    'invoice.create',
    'invoice.read',
    'payment.create',
    'laborder.read',
    'labresult.create',
    'labresult.release',
    'labresult.read',
    'notification.read',
    'analytics.read',
    'auditlog.read',
  ],
  // Doctor: runs clinical encounters, orders/reviews labs, and is the only
  // role that can query and review the MediAssist AI.
  DOCTOR: [
    'patient.read',
    'appointment.read',
    'appointment.update',
    'encounter.create',
    'encounter.read',
    'diagnosis.create',
    'laborder.create',
    'laborder.read',
    'labresult.read',
    'ai.consult',
    'ai.review',
    'notification.read',
    'analytics.read',
  ],
  // Nurse: records vitals and views patients/appointments, but cannot create
  // clinical records like diagnoses or lab orders. Holds 'analytics.read'
  // for their own dashboard (today's appointments, encounters in progress) —
  // added in Phase 9, since the blueprint's module list explicitly calls
  // for a "nurse's ward" dashboard view.
  NURSE: [
    'patient.read',
    'appointment.read',
    'encounter.read',
    'vitals.create',
    'notification.read',
    'analytics.read',
  ],
  // Patient: read-only access to their own appointments, results, and invoices
  // (ownership filtering happens in the service layer, not here — this list
  // only controls which *types* of resource a patient can read at all).
  // 'analytics.read' is included too — GET /analytics/dashboard is one
  // generic endpoint serving all 4 roles their own summary (upcoming
  // appointments, unread notifications, outstanding balance for a patient).
  PATIENT: ['appointment.read', 'labresult.read', 'invoice.read', 'notification.read', 'analytics.read'],
}
