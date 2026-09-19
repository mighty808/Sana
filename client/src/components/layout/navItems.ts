import {
  LayoutDashboard,
  Users,
  CalendarDays,
  FlaskConical,
  FileText,
  UserCog,
  ScrollText,
  ClipboardList,
  Stethoscope,
  Bell,
  HeartPulse,
  ChartColumn,
  Send,
  Pill,
  type LucideIcon,
} from 'lucide-react'
import type { Permission, RoleName } from '@/types/auth'

export interface NavItem {
  key: string
  label: string
  to: string
  icon: LucideIcon
  // Controls whether this link even appears in the sidebar — it's checked
  // against the logged-in user's role.permissions (see
  // useAuth().hasPermission). Every one of these permission strings matches
  // a real permission that the corresponding backend route also requires,
  // so a visible nav link never leads to something the user can't do.
  permission: Permission
}

// One shared list of nav items. Routes and icons never change based on
// role — only which items show up and under which group label changes.
// Keeping a single list here (instead of a separate list per role) means a
// route or icon only needs to be changed in one place.
const ITEMS = {
  dashboard: { key: 'dashboard', label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard, permission: 'analytics.read' },
  // Every role has the 'notification.read' permission, so this item is
  // always visible right under Dashboard. The sidebar badge (see
  // AppShell.tsx, which matches on this item's `to` route) shows the same
  // unread count as the header bell icon.
  notifications: { key: 'notifications', label: 'Notifications', to: '/notifications', icon: Bell, permission: 'notification.read' },
  patients: { key: 'patients', label: 'Patients', to: '/patients', icon: Users, permission: 'patient.read' },
  myPatients: { key: 'patients', label: 'My Patients', to: '/patients', icon: Users, permission: 'patient.read' },
  appointments: { key: 'appointments', label: 'Appointments', to: '/appointments', icon: CalendarDays, permission: 'appointment.read' },
  myAppointments: { key: 'appointments', label: 'My Appointments', to: '/appointments', icon: CalendarDays, permission: 'appointment.read' },
  myResults: { key: 'lab-results', label: 'My Results', to: '/lab-results', icon: FlaskConical, permission: 'labresult.read' },
  // This is the one lab screen used by every staff role. Ordering tests,
  // entering results, and releasing them are all done right on this page
  // (see LabOrdersPage.tsx), so Admin, Doctor, and Lab Tech don't need a
  // separate "Lab Results" link.
  labOrders: { key: 'lab-orders', label: 'Lab Orders', to: '/lab-orders', icon: ClipboardList, permission: 'laborder.read' },
  encounters: { key: 'encounters', label: 'Encounters', to: '/encounters', icon: Stethoscope, permission: 'encounter.read' },
  // One screen of every currently open encounter, color-coded by the
  // latest acuity read on it — see encounter.service.ts's getWardBoard.
  // Same 'encounter.read' permission as the Encounters list, since it's
  // really just another view over the same data.
  wardBoard: { key: 'ward-board', label: 'Ward Board', to: '/ward-board', icon: HeartPulse, permission: 'encounter.read' },
  invoices: { key: 'invoices', label: 'Invoices', to: '/invoices', icon: FileText, permission: 'invoice.read' },
  myInvoices: { key: 'invoices', label: 'My Invoices', to: '/invoices', icon: FileText, permission: 'invoice.read' },
  users: { key: 'users', label: 'Users', to: '/users', icon: UserCog, permission: 'user.manage' },
  auditLog: { key: 'audit-log', label: 'Audit Log', to: '/audit-logs', icon: ScrollText, permission: 'auditlog.read' },
  // Hospital-wide trend charts — its own permission (see types/permissions.ts
  // on the server), held only by Admin, so this is only ever placed in
  // NAV_GROUPS.ADMIN below, never any other role's list.
  analytics: { key: 'analytics', label: 'Analytics', to: '/analytics', icon: ChartColumn, permission: 'analytics.readTrends' },
  // A doctor-to-doctor feature end to end (see server/src/types/permissions.ts
  // — only DOCTOR holds 'referral.read'), so only ever placed in
  // NAV_GROUPS.DOCTOR below. Also carries its own unread badge (see
  // AppShell.tsx's referralUnreadCount) — same mechanism as the
  // Notifications item above, just narrowed to referral-related types.
  referrals: { key: 'referrals', label: 'Referrals', to: '/referrals', icon: Send, permission: 'referral.read' },
  // Held by DOCTOR (their own, written), ADMIN (oversight), PATIENT (their
  // own, filled), and PHARMACIST (the pharmacy queue — see PrescriptionsPage.tsx,
  // which shows a different view depending on which of those roles is
  // looking, the same way LabOrdersPage does for laborder.read).
  prescriptions: { key: 'prescriptions', label: 'Prescriptions', to: '/prescriptions', icon: Pill, permission: 'prescription.read' },
} as const satisfies Record<string, NavItem>

export interface NavGroup {
  label: string
  items: NavItem[]
}

// Navigation items grouped by role, with each group given a section label
// (like Overview, Clinical, Management, System for Admin). Each item can
// still be hidden individually if the logged-in role lacks its permission
// (see AppShell), so this grouping only affects how things are displayed —
// the backend's permission check is what actually controls access.
export const NAV_GROUPS: Record<RoleName, NavGroup[]> = {
  ADMIN: [
    { label: 'Overview', items: [ITEMS.dashboard, ITEMS.analytics, ITEMS.notifications] },
    {
      label: 'Clinical',
      items: [ITEMS.patients, ITEMS.appointments, ITEMS.encounters, ITEMS.wardBoard, ITEMS.labOrders, ITEMS.prescriptions],
    },
    { label: 'Management', items: [ITEMS.users, ITEMS.invoices] },
    { label: 'System', items: [ITEMS.auditLog] },
  ],
  DOCTOR: [
    { label: 'Overview', items: [ITEMS.dashboard, ITEMS.notifications] },
    {
      label: 'Clinical',
      items: [ITEMS.myAppointments, ITEMS.myPatients, ITEMS.encounters, ITEMS.wardBoard, ITEMS.referrals],
    },
    { label: 'AI & Lab', items: [ITEMS.labOrders, ITEMS.prescriptions] },
  ],
  NURSE: [
    { label: 'Overview', items: [ITEMS.dashboard, ITEMS.notifications] },
    { label: 'Care', items: [ITEMS.patients, ITEMS.myAppointments, ITEMS.encounters, ITEMS.wardBoard] },
  ],
  PATIENT: [
    {
      label: 'My Health',
      items: [
        ITEMS.dashboard,
        ITEMS.notifications,
        ITEMS.myAppointments,
        ITEMS.myResults,
        ITEMS.myInvoices,
        ITEMS.prescriptions,
      ],
    },
  ],
  LAB_TECH: [
    { label: 'Overview', items: [ITEMS.dashboard, ITEMS.notifications] },
    { label: 'Lab', items: [ITEMS.labOrders] },
  ],
  PHARMACIST: [
    { label: 'Overview', items: [ITEMS.dashboard, ITEMS.notifications] },
    { label: 'Pharmacy', items: [ITEMS.prescriptions] },
  ],
}
