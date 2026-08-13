// GET /analytics/dashboard returns a different shape per role (see
// analytics.service.ts's getDashboard switch) — modeled as a discriminated
// union on `role` so each render branch gets full type-safety on exactly
// the fields that role's response actually has.
export type DashboardSummary =
  | {
      role: 'ADMIN'
      totalPatients: number
      totalStaffUsers: number
      appointmentsToday: number
      pendingLabOrders: number
      outstandingBalance: number
    }
  | {
      role: 'DOCTOR'
      myPatients: number
      appointmentsToday: number
      activeEncounters: number
      labOrdersAwaitingReview: number
      aiConsultationsUnreviewed: number
    }
  | {
      // Per Sana_Workflow_Prompt.md's role realignment (2026-08-11): Nurse
      // is the front-line operator — registration, check-in, and the
      // mandatory vitals gate — so the dashboard tracks exactly those 3
      // things now (see analytics.service.ts's getNurseDashboard).
      role: 'NURSE'
      patientsRegisteredToday: number
      appointmentsCheckedInToday: number
      vitalsPendingCount: number
    }
  | {
      role: 'PATIENT'
      upcomingAppointments: number
      unreadNotifications: number
      outstandingBalance: number
    }
  | {
      role: 'LAB_TECH'
      pendingOrders: number
      inProgressOrders: number
      completedToday: number
      releasedToday: number
    }
