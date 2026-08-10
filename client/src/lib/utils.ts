import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

// Standard shadcn/ui helper: merges conditional class names (via clsx) and
// then resolves conflicting Tailwind utility classes (via tailwind-merge),
// so e.g. cn('p-2', condition && 'p-4') correctly ends up as just 'p-4'
// instead of both classes being applied. Used by every shadcn/ui component.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
