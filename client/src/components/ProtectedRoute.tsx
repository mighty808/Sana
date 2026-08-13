import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/features/auth/useAuth'
import type { Permission } from '@/types/auth'

interface ProtectedRouteProps {
  // If given, the route additionally requires the logged-in user's role to
  // hold this permission — matches the exact permission string the
  // corresponding backend endpoint's requirePermission() middleware checks
  // (see server/src/types/permissions.ts), so a nav link/route only ever
  // exists client-side for something the user could actually do server-side too.
  permission?: Permission
}

// Wraps a group of routes (via <Outlet/>) so they only render for a logged-in
// user, optionally gated further by a specific permission. Unauthenticated
// users are bounced to /login with the page they wanted preserved in
// location state, so login can send them back afterward. This is a UX
// convenience, not the real security boundary — every actual data-fetching
// call still goes through the backend, which enforces the same permission
// check for real (see middleware/rbac.ts server-side).
export function ProtectedRoute({ permission }: ProtectedRouteProps) {
  const { user, isBooting, hasPermission } = useAuth()
  const location = useLocation()

  // Still checking for an existing session (silent refresh on app boot) —
  // render nothing rather than redirecting prematurely, which would bounce
  // an already-logged-in user to /login for a single frame on every reload.
  if (isBooting) return null

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (permission && !hasPermission(permission)) {
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}
