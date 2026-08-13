import type { RoleName } from '@/types/auth'

// Plain-English display labels for the RoleName enum — shared by the
// sidebar's role badge (AppShell) and the Users list/role badges, so the
// mapping lives in exactly one place instead of drifting between two
// component-local copies.
export const ROLE_LABELS: Record<RoleName, string> = {
  ADMIN: 'Admin',
  DOCTOR: 'Doctor',
  NURSE: 'Nurse',
  PATIENT: 'Patient',
  LAB_TECH: 'Lab Technician',
}
