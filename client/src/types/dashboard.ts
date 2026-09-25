// GET /analytics/dashboard returns different fields depending on the user's
// role (see analytics.service.ts's getDashboard switch). This type is
// modeled as a union that switches on the `role` field, so that TypeScript
// can check, for each role, exactly the fields that role's response
// actually includes.
export type DashboardSummary =
  | {
      role: 'ADMIN'
      totalPatients: number
      totalStaffUsers: number
      appointmentsToday: number
      pendingLabOrders: number
      outstandingBalance: number
      // Open encounters whose latest Sana AI acuity read is CRITICAL — see
      // analytics.service.ts's countCriticalOpenEncounters. Powers the
      // sidebar's Ward Board badge (AppShell.tsx's getDashboardBadge).
      criticalPatients: number
      // How many invoices are still UNPAID/PARTIALLY_PAID — a count,
      // unlike outstandingBalance above (the money sum across them).
      // Powers the sidebar's Invoices badge.
      pendingInvoices: number
      // System-wide PRESCRIBED-but-not-DISPENSED count — powers the
      // sidebar's Prescriptions badge for Admin's oversight view.
      pendingPrescriptions: number
    }
  | {
      role: 'DOCTOR'
      myPatients: number
      appointmentsToday: number
      activeEncounters: number
      labOrdersAwaitingReview: number
      aiConsultationsUnreviewed: number
      criticalPatients: number
      // This doctor's own written-but-not-dispensed prescriptions —
      // powers the sidebar's Prescriptions badge.
      myPendingPrescriptions: number
    }
  | {
      // The Nurse is the front-line operator, handling registration,
      // check-in, and the mandatory vitals step, so the dashboard tracks
      // exactly those 3 things (see analytics.service.ts's
      // getNurseDashboard).
      role: 'NURSE'
      patientsRegisteredToday: number
      appointmentsCheckedInToday: number
      vitalsPendingCount: number
      criticalPatients: number
    }
  | {
      role: 'PATIENT'
      upcomingAppointments: number
      unreadNotifications: number
      outstandingBalance: number
      // Prescriptions written for this patient but not yet collected —
      // powers the sidebar's Prescriptions badge.
      pendingPrescriptions: number
    }
  | {
      role: 'LAB_TECH'
      pendingOrders: number
      inProgressOrders: number
      completedToday: number
      releasedToday: number
    }
  | {
      // The Pharmacist dashboard: same two-stat shape as Lab Tech's
      // "pending queue" + "done by me today," just for the pharmacy
      // workflow (see analytics.service.ts's getPharmacistDashboard).
      role: 'PHARMACIST'
      pendingPrescriptions: number
      dispensedToday: number
    }
