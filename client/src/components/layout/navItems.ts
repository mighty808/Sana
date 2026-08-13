import {
  LayoutDashboard,
  Users,
  CalendarDays,
  FlaskConical,
  FileText,
  Building2,
  UserCog,
  ScrollText,
  ClipboardList,
  Stethoscope,
  type LucideIcon,
} from 'lucide-react'
import type { Permission, RoleName } from '@/types/auth'

export interface NavItem {
  key: string
  label: string
  to: string
  icon: LucideIcon
  // Gates whether this link even appears in the sidebar — checked against
  // the logged-in user's role.permissions (see useAuth().hasPermission).
  // Every one of these strings matches a real permission the corresponding
  // backend route also requires, so a visible nav link is never a dead end.
  permission: Permission
}

// One shared item registry — routes and icons never change per role, only
// which items surface and under what group label do. Keeping a single
// registry (rather than 4 fully separate arrays) means a route/icon change
// happens in exactly one place instead of four.
const ITEMS = {
  dashboard: { key: 'dashboard', label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard, permission: 'analytics.read' },
  patients: { key: 'patients', label: 'Patients', to: '/patients', icon: Users, permission: 'patient.read' },
  myPatients: { key: 'patients', label: 'My Patients', to: '/patients', icon: Users, permission: 'patient.read' },
  appointments: { key: 'appointments', label: 'Appointments', to: '/appointments', icon: CalendarDays, permission: 'appointment.read' },
  myAppointments: { key: 'appointments', label: 'My Appointments', to: '/appointments', icon: CalendarDays, permission: 'appointment.read' },
  labQueue: { key: 'lab-results', label: 'Lab Queue', to: '/lab-results', icon: FlaskConical, permission: 'labresult.read' },
  labResults: { key: 'lab-results', label: 'Lab Results', to: '/lab-results', icon: FlaskConical, permission: 'labresult.read' },
  myResults: { key: 'lab-results', label: 'My Results', to: '/lab-results', icon: FlaskConical, permission: 'labresult.read' },
  labOrders: { key: 'lab-orders', label: 'Lab Orders', to: '/lab-orders', icon: ClipboardList, permission: 'laborder.read' },
  encounters: { key: 'encounters', label: 'Encounters', to: '/encounters', icon: Stethoscope, permission: 'encounter.read' },
  invoices: { key: 'invoices', label: 'Invoices', to: '/invoices', icon: FileText, permission: 'invoice.read' },
  myInvoices: { key: 'invoices', label: 'My Invoices', to: '/invoices', icon: FileText, permission: 'invoice.read' },
  departments: { key: 'departments', label: 'Departments', to: '/departments', icon: Building2, permission: 'department.manage' },
  users: { key: 'users', label: 'Users', to: '/users', icon: UserCog, permission: 'user.manage' },
  auditLog: { key: 'audit-log', label: 'Audit Log', to: '/audit-logs', icon: ScrollText, permission: 'auditlog.read' },
} as const satisfies Record<string, NavItem>

export interface NavGroup {
  label: string
  items: NavItem[]
}

// Grouped, role-specific navigation — matches the design spec's exact
// per-role section labels (OVERVIEW/CLINICAL/MANAGEMENT/SYSTEM for Admin,
// etc.). Each item is still independently hidden if the logged-in role
// lacks its permission (see AppShell), so this grouping is a presentation
// concern only — the backend's permission check is the real gate.
export const NAV_GROUPS: Record<RoleName, NavGroup[]> = {
  ADMIN: [
    { label: 'Overview', items: [ITEMS.dashboard] },
    { label: 'Clinical', items: [ITEMS.patients, ITEMS.appointments, ITEMS.encounters, ITEMS.labOrders, ITEMS.labQueue] },
    { label: 'Management', items: [ITEMS.users, ITEMS.departments, ITEMS.invoices] },
    { label: 'System', items: [ITEMS.auditLog] },
  ],
  DOCTOR: [
    { label: 'Overview', items: [ITEMS.dashboard] },
    { label: 'Clinical', items: [ITEMS.myAppointments, ITEMS.myPatients, ITEMS.encounters] },
    { label: 'AI & Lab', items: [ITEMS.labOrders, ITEMS.labResults] },
  ],
  NURSE: [
    { label: 'Overview', items: [ITEMS.dashboard] },
    { label: 'Care', items: [ITEMS.patients, ITEMS.myAppointments, ITEMS.encounters] },
  ],
  PATIENT: [
    {
      label: 'My Health',
      items: [ITEMS.dashboard, ITEMS.myAppointments, ITEMS.myResults, ITEMS.myInvoices],
    },
  ],
  LAB_TECH: [
    { label: 'Overview', items: [ITEMS.dashboard] },
    { label: 'Lab', items: [ITEMS.labOrders, ITEMS.labResults] },
  ],
}
