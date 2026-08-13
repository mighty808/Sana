import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'

// The shape every Sana API response comes back in — see server/src/utils/apiResponse.ts's
// ok()/fail() helpers, which every controller in the backend uses. Mirroring
// that shape here means every API call in the app can be typed the same way.
export interface ApiSuccess<T> {
  success: true
  data: T
}
export interface ApiError {
  success: false
  error: { code: string; message: string }
}

// The single Axios instance every feature's API calls go through.
// `baseURL: '/api/v1'` relies on vite.config.ts's dev proxy (and, in
// production, on the client being served from the same origin as the API)
// so calls never need a hardcoded host. `withCredentials: true` lets the
// browser send/receive the httpOnly refresh-token cookie the backend's
// auth.controller.ts sets on login (see server/src/controllers/auth.controller.ts).
export const api = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
})

// The current access token lives here, not in React state — this file has
// no dependency on React, so the interceptors below can read/write it
// synchronously on every request without needing to reach into a context.
// AuthProvider (src/features/auth/AuthContext.tsx) is the only thing that
// calls setAccessToken(), right after login/refresh/logout.
let accessToken: string | null = null
export function setAccessToken(token: string | null) {
  accessToken = token
}
// Read-only counterpart to setAccessToken — used by lib/socket.ts so the
// Socket.IO handshake can always send whatever the current access token is
// (it's re-read on every (re)connect attempt, not captured once), without
// duplicating token state in a second place.
export function getAccessToken(): string | null {
  return accessToken
}

// Called by AuthProvider once, so that when a silent token refresh fails
// (the refresh cookie itself expired or was revoked), this file can trigger
// a logout/redirect without importing React Router or the auth context
// directly (which would create a circular import: api.ts -> AuthContext ->
// api.ts). AuthProvider registers its own logout function here instead.
let onAuthExpired: (() => void) | null = null
export function setOnAuthExpired(handler: () => void) {
  onAuthExpired = handler
}

// Attaches the current access token to every outgoing request — mirrors
// the backend's `auth` middleware, which expects exactly this header
// (see server/src/middleware/auth.ts).
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`
  }
  return config
})

// Extends Axios's request config with a flag marking "this request has
// already been retried once after a token refresh" — without this, a
// request that fails again even after a successful refresh (e.g. the user
// genuinely lacks permission) would otherwise loop forever between 401 and
// refresh attempts.
interface RetryableConfig extends InternalAxiosRequestConfig {
  _retried?: boolean
}

// One in-flight refresh promise shared by every request that hits a 401 at
// the same time — without this, 5 simultaneous requests failing together
// would each independently call /auth/refresh, racing to rotate the same
// refresh cookie against each other (see server/src/services/auth.service.ts's
// rotateRefreshToken, which invalidates the previous refresh token on each call).
let refreshPromise: Promise<string> | null = null

async function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = api
      .post<ApiSuccess<{ accessToken: string }>>('/auth/refresh')
      .then((res) => {
        const token = res.data.data.accessToken
        setAccessToken(token)
        return token
      })
      .finally(() => {
        refreshPromise = null
      })
  }
  return refreshPromise
}

// On a 401 (access token expired/invalid), silently try to refresh it once
// and replay the original request — this is what lets a user stay logged
// in across the 15-minute access-token lifetime without ever seeing a
// re-login prompt, as long as their refresh cookie (7 days) is still valid.
api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const config = error.config as RetryableConfig | undefined
    const status = error.response?.status

    const isAuthEndpoint = config?.url?.startsWith('/auth/')
    if (status !== 401 || !config || config._retried || isAuthEndpoint) {
      throw error
    }

    config._retried = true
    try {
      const token = await refreshAccessToken()
      config.headers.Authorization = `Bearer ${token}`
      return api(config)
    } catch (refreshError) {
      setAccessToken(null)
      onAuthExpired?.()
      throw refreshError
    }
  },
)

// Pulls the human-readable message out of a failed API call — every
// backend error follows the { success: false, error: { code, message } }
// shape, so this is the one place that unwraps it instead of every call
// site reaching into `err.response.data.error.message` by hand.
export function getApiErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as ApiError | undefined
    if (data?.error?.message) return data.error.message
  }
  return 'Something went wrong. Please try again.'
}
