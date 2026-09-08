import { Routes, Route, Navigate } from 'react-router-dom'
import { LandingPage } from '@/features/landing/LandingPage'
import { LoginPage } from '@/features/auth/LoginPage'
import { ForgotPasswordPage } from '@/features/auth/ForgotPasswordPage'
import { ResetPasswordPage } from '@/features/auth/ResetPasswordPage'
import { ProfilePage } from '@/features/profile/ProfilePage'
import { PatientsPage } from '@/features/patients/PatientsPage'
import { PatientDetailPage } from '@/features/patients/PatientDetailPage'
import { UsersPage } from '@/features/users/UsersPage'
import { AppointmentsPage } from '@/features/appointments/AppointmentsPage'
import { EncountersListPage } from '@/features/encounters/EncountersListPage'
import { EncounterPage } from '@/features/encounters/EncounterPage'
import { WardBoardPage } from '@/features/encounters/WardBoardPage'
import { LabOrdersPage } from '@/features/labOrders/LabOrdersPage'
import { LabResultsPage } from '@/features/labResults/LabResultsPage'
import { InvoicesPage } from '@/features/invoices/InvoicesPage'
import { InvoiceDetailPage } from '@/features/invoices/InvoiceDetailPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { AnalyticsPage } from '@/features/analytics/AnalyticsPage'
import { AuditLogsPage } from '@/features/auditLogs/AuditLogsPage'
import { NotificationsPage } from '@/features/notifications/NotificationsPage'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { AppShell } from '@/components/layout/AppShell'

// This is the full list of pages and their URLs. `/` is the public landing
// page. It has no sidebar/top bar and doesn't require login — it links to
// /login, or straight to /dashboard if the user is already signed in. Every
// other page sits behind <ProtectedRoute> (so login is required) inside
// <AppShell> (which adds the sidebar and top bar). Some pages also require a
// specific permission — see components/ProtectedRoute.tsx and
// components/layout/navItems.ts. Both of those files use the exact same
// permission names the backend checks, so if a page shows up here, the
// backend will always allow the matching request too.
function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/notifications" element={<NotificationsPage />} />

          <Route element={<ProtectedRoute permission="patient.read" />}>
            <Route path="/patients" element={<PatientsPage />} />
            <Route path="/patients/:id" element={<PatientDetailPage />} />
          </Route>

          <Route element={<ProtectedRoute permission="appointment.read" />}>
            <Route path="/appointments" element={<AppointmentsPage />} />
          </Route>

          <Route element={<ProtectedRoute permission="encounter.read" />}>
            <Route path="/encounters" element={<EncountersListPage />} />
            <Route path="/encounters/:id" element={<EncounterPage />} />
            <Route path="/ward-board" element={<WardBoardPage />} />
          </Route>

          <Route element={<ProtectedRoute permission="laborder.read" />}>
            <Route path="/lab-orders" element={<LabOrdersPage />} />
          </Route>

          <Route element={<ProtectedRoute permission="labresult.read" />}>
            <Route path="/lab-results" element={<LabResultsPage />} />
          </Route>

          <Route element={<ProtectedRoute permission="invoice.read" />}>
            <Route path="/invoices" element={<InvoicesPage />} />
            <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
          </Route>

          <Route element={<ProtectedRoute permission="user.manage" />}>
            <Route path="/users" element={<UsersPage />} />
          </Route>

          <Route element={<ProtectedRoute permission="auditlog.read" />}>
            <Route path="/audit-logs" element={<AuditLogsPage />} />
          </Route>

          <Route element={<ProtectedRoute permission="analytics.readTrends" />}>
            <Route path="/analytics" element={<AnalyticsPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
