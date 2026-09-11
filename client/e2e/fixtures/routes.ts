// The app's route → permission map, mirrored once from client/src/App.tsx's
// <ProtectedRoute permission="..."> wrappers. Only top-level list routes are
// here; the detail routes (/patients/:id, /encounters/:id, /invoices/:id) sit
// behind the same guards as their list and need real record ids, so they're
// covered by the feature specs instead of the access matrix.
export const PERMISSIONED_ROUTES = [
  { path: '/patients', permission: 'patient.read' },
  { path: '/appointments', permission: 'appointment.read' },
  { path: '/encounters', permission: 'encounter.read' },
  { path: '/ward-board', permission: 'encounter.read' },
  { path: '/lab-orders', permission: 'laborder.read' },
  { path: '/lab-results', permission: 'labresult.read' },
  { path: '/invoices', permission: 'invoice.read' },
  { path: '/users', permission: 'user.manage' },
  { path: '/audit-logs', permission: 'auditlog.read' },
  { path: '/analytics', permission: 'analytics.readTrends' },
  { path: '/referrals', permission: 'referral.read' },
  { path: '/prescriptions', permission: 'prescription.read' },
] as const

// Behind login, but open to every role once logged in — no permission needed.
export const OPEN_ROUTES = ['/dashboard', '/profile', '/notifications'] as const
