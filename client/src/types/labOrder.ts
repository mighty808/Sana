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

// Unlike Appointment and Encounter, listLabOrders() and getLabOrderById()
// always fill in the full patient object and the doctor's public fields,
// no matter what role is calling. There's no case here where these come
// back as raw id strings.
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

// This is the response shape of GET /lab-orders/:id.
export interface LabOrderDetail {
  order: LabOrder
  results: LabResult[]
}
