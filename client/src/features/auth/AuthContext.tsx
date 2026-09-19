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
  // True only while the app is still doing its first check, on startup, for
  // whether the user already has a valid session. Screens use this flag to
  // avoid briefly flashing the login page before that check confirms a
  // still-valid session actually exists.
  isBooting: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  // Checks the logged-in user's role.permissions list, using the exact same
  // permission names that server/src/middleware/rbac.ts's requirePermission()
  // checks on the server. This is only a convenience for the interface —
  // it hides or disables things the user can't do — and is not itself a
  // security measure. The server enforces the real access rules on every
  // request no matter what the interface shows or hides.
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
      // Clear the local state no matter whether the network call itself
      // succeeded or not — showing the logged-out screen is the right thing
      // to do either way. The server also bumps a version number that
      // invalidates old refresh tokens, but that's just an extra safety
      // measure and isn't something the interface needs to wait on.
      setAccessToken(null)
      setUser(null)
    }
  }, [])

  // When the app first loads, quietly try to trade whatever refresh cookie
  // the browser already has, left over from a previous visit, for a fresh
  // access token. This is what makes "close the tab, come back tomorrow,
  // still logged in" work, without ever storing the access token itself in
  // localStorage (it's kept only in memory, inside lib/api.ts).
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
        // No valid refresh cookie was found. That's a completely normal
        // "not logged in yet" state, not an error to show the user.
      })
      .finally(() => {
        if (!cancelled) setIsBooting(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Registers a callback with lib/api.ts so that if a silent token refresh
  // ever fails during normal use, for example because the refresh cookie
  // expired or was revoked somewhere else, the app clears its user state and
  // the route guards send the user back to /login. See lib/api.ts's response
  // interceptor for where this callback actually gets triggered from.
  useEffect(() => {
    setOnAuthExpired(() => setUser(null))
  }, [])

  // Connects the socket the moment a user is confirmed logged in, and
  // disconnects it when they're not. This covers every situation that can
  // change whether the user is logged in: a fresh login, the silent
  // startup refresh above, restoring a session after the token rotates, or
  // losing the session when onAuthExpired fires. Every one of those cases
  // ends up changing this same `user` state, so a single effect here can
  // handle all of them, instead of having to call connect or disconnect
  // separately in each place that might change the login state.
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
