import { Routes, Route, Navigate } from 'react-router-dom'
import { LandingPage } from '@/features/landing/LandingPage'
import { LoginPage } from '@/features/auth/LoginPage'
import { ForgotPasswordPage } from '@/features/auth/ForgotPasswordPage'
import { ResetPasswordPage } from '@/features/auth/ResetPasswordPage'
import { ProfilePage } from '@/features/profile/ProfilePage'
import { PatientsPage } from '@/features/patients/PatientsPage'
import { PatientDetailPage } from '@/features/patients/PatientDetailPage'
import { DepartmentsPage } from '@/features/departments/DepartmentsPage'
import { UsersPage } from '@/features/users/UsersPage'
import { AppointmentsPage } from '@/features/appointments/AppointmentsPage'
import { EncountersListPage } from '@/features/encounters/EncountersListPage'
import { EncounterPage } from '@/features/encounters/EncounterPage'
import { LabOrdersPage } from '@/features/labOrders/LabOrdersPage'
import { LabResultsPage } from '@/features/labResults/LabResultsPage'
import { InvoicesPage } from '@/features/invoices/InvoicesPage'
import { InvoiceDetailPage } from '@/features/invoices/InvoiceDetailPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { AuditLogsPage } from '@/features/auditLogs/AuditLogsPage'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { AppShell } from '@/components/layout/AppShell'

// The full route tree. `/` is the public landing page (no shell, no login
// required — it links to /login or, if already signed in, straight to
// /dashboard). Every other route sits behind <ProtectedRoute> (login
// required) inside <AppShell> (sidebar + top bar). A handful of routes
// additionally require a specific permission — see components/ProtectedRoute.tsx
// and components/layout/navItems.ts, both of which use the exact same
// permission strings the backend's own requirePermission() middleware
// checks, so a route that renders here is never one the backend would
// actually reject.
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

          <Route element={<ProtectedRoute permission="department.manage" />}>
            <Route path="/departments" element={<DepartmentsPage />} />
          </Route>

          <Route element={<ProtectedRoute permission="user.manage" />}>
            <Route path="/users" element={<UsersPage />} />
          </Route>

          <Route element={<ProtectedRoute permission="auditlog.read" />}>
            <Route path="/audit-logs" element={<AuditLogsPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
