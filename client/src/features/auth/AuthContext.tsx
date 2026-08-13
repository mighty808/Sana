import { createContext, useCallback, useEffect, useState, type ReactNode } from 'react'
import { api, setAccessToken, setOnAuthExpired, type ApiSuccess } from '@/lib/api'
import { connectSocket, disconnectSocket } from '@/lib/socket'
import type { AuthUser, Permission } from '@/types/auth'

interface LoginResponse {
  accessToken: string
  user: AuthUser
}

interface AuthContextValue {
  user: AuthUser | null
  // True only during the initial "do we already have a valid session?"
  // check on app boot — screens use this to avoid flashing the login page
  // for a split second before a still-valid refresh cookie is confirmed.
  isBooting: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  // Checks the logged-in user's role.permissions array — the exact same
  // permission strings server/src/middleware/rbac.ts's requirePermission()
  // checks server-side. This is a UX convenience only (hide/disable things
  // a user can't do), NOT a security boundary — the backend enforces the
  // real access control on every request regardless of what the UI shows.
  hasPermission: (permission: Permission) => boolean
}

// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isBooting, setIsBooting] = useState(true)

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post<ApiSuccess<LoginResponse>>('/auth/login', { email, password })
    setAccessToken(res.data.data.accessToken)
    setUser(res.data.data.user)
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout')
    } finally {
      // Clear local state regardless of whether the network call itself
      // succeeded — a logged-out UI is the right outcome either way; the
      // server-side tokenVersion bump (which invalidates refresh tokens)
      // is a nice-to-have here, not something the UI should block on.
      setAccessToken(null)
      setUser(null)
    }
  }, [])

  // On first mount, silently try to exchange whatever refresh cookie the
  // browser already has (from a previous visit) for a fresh access token —
  // this is what makes "close the tab, come back tomorrow, still logged
  // in" work, without ever storing the access token itself in
  // localStorage (kept in memory only, inside lib/api.ts).
  useEffect(() => {
    let cancelled = false
    api
      .post<ApiSuccess<LoginResponse>>('/auth/refresh')
      .then((res) => {
        if (cancelled) return
        setAccessToken(res.data.data.accessToken)
        setUser(res.data.data.user)
      })
      .catch(() => {
        // No valid refresh cookie — that's a completely normal "not logged
        // in yet" state, not an error to surface to the user.
      })
      .finally(() => {
        if (!cancelled) setIsBooting(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Registers with lib/api.ts so that if a silent token refresh ever fails
  // DURING normal use (the refresh cookie expired or was revoked elsewhere),
  // the app's user state clears and route guards redirect to /login — see
  // lib/api.ts's response interceptor for where this actually fires from.
  useEffect(() => {
    setOnAuthExpired(() => setUser(null))
  }, [])

  // Connects the moment a user is confirmed logged in — whether that's a
  // fresh login, the silent boot-time refresh above, restoring a session
  // after a token rotation, or losing one (onAuthExpired firing) — every
  // one of those funnels through this same `user` state change, so one
  // effect covers all of them instead of calling connect/disconnect
  // separately at each individual call site.
  useEffect(() => {
    if (user) {
      connectSocket()
    } else {
      disconnectSocket()
    }
  }, [user])

  const hasPermission = useCallback(
    (permission: Permission) => Boolean(user?.role.permissions.includes(permission)),
    [user],
  )

  return (
    <AuthContext.Provider value={{ user, isBooting, login, logout, hasPermission }}>{children}</AuthContext.Provider>
  )
}
