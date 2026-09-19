import type { AuthedUser } from '../types/user.js'
import type { RoleName } from '../types/permissions.js'

// Narrows a list/lookup filter down to "just this doctor's own records"
// when the requester is a DOCTOR, and leaves it untouched for every other
// role (ADMIN/NURSE/LAB_TECH see everything by default; PATIENT-scoping is
// handled separately wherever it applies, since it filters by `patient`,
// not `doctor`, and often needs a different query shape entirely — see
// e.g. appointment.service.ts's listAppointments).
//
// This exact rule — "if the caller is a Doctor, restrict to filter.doctor
// = their own id" — used to be hand-rolled identically at several call
// sites (encounter.service.ts's listEncounters/getWardBoard,
// labOrder.service.ts's listLabOrders, appointment.service.ts's
// updateAppointmentStatus). Pulling it into one function means the rule
// only has to change in one place if it ever does (e.g. to also include
// encounters a doctor was referred onto), instead of a future change
// silently missing one of the copies.
export function scopeToOwnDoctor(filter: Record<string, unknown>, user: AuthedUser): Record<string, unknown> {
  if (user.role.name === 'DOCTOR') filter.doctor = user.id
  return filter
}

// Some roles hold a resource's `*.read` permission only so they can reach
// one specific lookup they already have the id for, never to browse the
// resource's full list — e.g. LAB_TECH and PHARMACIST hold 'invoice.read'
// only to check one lab order's/prescription's own invoice (see
// invoice.service.ts's getInvoiceForLabOrder/getInvoiceForPrescription),
// and NURSE holds 'laborder.read' only so the Encounter page's own lab
// section can load (see labOrder.service.ts's listLabOrdersForEncounter).
// This was previously hand-rolled as an identical `if (user.role.name ===
// ...) return []` at each list function; centralizing it means a third
// list function (or a role's permission grant changing) only has to
// update the caller's own `blockedRoles` list, not re-derive this rule.
export function isBrowsingBlocked(user: AuthedUser, blockedRoles: RoleName[]): boolean {
  return blockedRoles.includes(user.role.name)
}
