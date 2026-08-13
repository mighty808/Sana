import type { Patient } from './patient'
import type { AppointmentDoctorRef } from './appointment'
import type { LabResult } from './labResult'

export const LAB_ORDER_STATUSES = ['ORDERED', 'PROCESSING', 'COMPLETED', 'REVIEWED'] as const
export type LabOrderStatus = (typeof LAB_ORDER_STATUSES)[number]

export const LAB_ORDER_PRIORITIES = ['ROUTINE', 'URGENT'] as const
export type LabOrderPriority = (typeof LAB_ORDER_PRIORITIES)[number]

export interface LabTestItem {
  testName: string
  status: 'PENDING' | 'COMPLETED'
}

// Unlike Appointment/Encounter, listLabOrders() and getLabOrderById() both
// ALWAYS populate patient (full) and doctor (PUBLIC_USER_FIELDS) the same
// way regardless of the caller's role — no role-dependent partial
// population here, so these are never raw id strings.
export interface LabOrder {
  _id: string
  labOrderNumber: string
  encounter: string
  patient: Patient
  doctor: AppointmentDoctorRef
  tests: LabTestItem[]
  priority: LabOrderPriority
  clinicalNotes?: string
  status: LabOrderStatus
  orderedAt: string
}

// GET /lab-orders/:id's response shape.
export interface LabOrderDetail {
  order: LabOrder
  results: LabResult[]
}
