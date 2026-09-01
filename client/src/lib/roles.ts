import type { RoleName } from '@/types/auth'

// Plain-English display labels for each role name. This is shared by the
// sidebar's role badge (AppShell) and the Users list's role badges, so the
// wording stays consistent in one place instead of being copied separately
// into two components.
export const ROLE_LABELS: Record<RoleName, string> = {
  ADMIN: 'Admin',
  DOCTOR: 'Doctor',
  NURSE: 'Nurse',
  PATIENT: 'Patient',
  LAB_TECH: 'Lab Technician',
}
