import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

// Standard shadcn/ui helper: merges conditional class names (via clsx) and
// then resolves conflicting Tailwind utility classes (via tailwind-merge),
// so e.g. cn('p-2', condition && 'p-4') correctly ends up as just 'p-4'
// instead of both classes being applied. Used by every shadcn/ui component.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Narrows a reference field that's sometimes a populated object and
// sometimes just its raw id string — several backend endpoints populate a
// ref for some roles/branches but not others (Appointment.patient/doctor,
// Invoice.patient, etc.), so every screen consuming one of those fields
// needs this same check. Shared here instead of redefined per feature.
export function isPopulated<T extends object>(ref: T | string): ref is T {
  return typeof ref === 'object'
}
