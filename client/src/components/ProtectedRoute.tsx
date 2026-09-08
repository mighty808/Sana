import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/features/auth/useAuth'
import type { Permission } from '@/types/auth'

interface ProtectedRouteProps {
  // If given, this page also requires the logged-in user's role to have
  // this permission. It matches the exact permission name that the
  // matching backend endpoint checks (see server/src/types/permissions.ts),
  // so a nav link or page only exists on the frontend if the user could
  // actually use it on the backend too.
  permission?: Permission
}

// Wraps a group of pages (via <Outlet/>) so they only show for a logged-in
// user, and optionally require a specific permission on top of that. Users
// who aren't logged in are sent to /login, with the page they were trying
// to reach saved so login can send them back there afterward. This check is
// just a convenience for the user experience, not real security — every
// actual data request still goes through the backend, which enforces the
// same permission check for real (see middleware/rbac.ts on the server).
export function ProtectedRoute({ permission }: ProtectedRouteProps) {
  const { user, isBooting, hasPermission } = useAuth()
  const location = useLocation()

  // The app is still checking whether the user has an existing session
  // (this happens silently when the app first loads). We render nothing
  // here instead of redirecting right away, because redirecting too early
  // would briefly send an already-logged-in user to /login on every reload.
  if (isBooting) return null

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (permission && !hasPermission(permission)) {
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}
