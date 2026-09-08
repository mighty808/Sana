import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

// This is the standard shadcn/ui helper function. It combines conditional
// class names together (using clsx), then resolves any conflicting
// Tailwind classes (using tailwind-merge). For example, cn('p-2', condition
// && 'p-4') correctly ends up as just 'p-4' instead of applying both
// classes at once. It's used by every shadcn/ui component.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Checks whether a reference field is a full object or just its raw id
// string. Several backend endpoints fill in the full object for some roles
// or code paths but not others (for example, Appointment.patient/doctor or
// Invoice.patient), so any screen using one of these fields needs this same
// check. It's defined once here instead of being rewritten in every
// feature that needs it.
export function isPopulated<T extends object>(ref: T | string): ref is T {
  return typeof ref === 'object'
}
