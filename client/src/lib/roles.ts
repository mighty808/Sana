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
  PHARMACIST: 'Pharmacist',
}

// Every role name, derived from ROLE_LABELS rather than written out a
// second time. ROLE_LABELS is a Record<RoleName, string>, so TypeScript
// already forces it to have an entry for every role in the union — which
// means this list is exhaustive by construction and can't fall behind.
// The Users page builds both its "role" dropdown and that dropdown's
// validation from this: each of those used to carry its own hardcoded
// copy of the role list, and both silently missed PHARMACIST when it was
// added, leaving an Admin with no way to create a pharmacist account.
export const ROLE_NAMES = Object.keys(ROLE_LABELS) as RoleName[]
