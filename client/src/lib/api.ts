import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'

// This is the shape every Sana API response comes back in — see the ok()
// and fail() helpers in server/src/utils/apiResponse.ts, which every
// controller on the backend uses. Matching that shape here means every API
// call in the app can be typed the same way.
export interface ApiSuccess<T> {
  success: true
  data: T
}
export interface ApiError {
  success: false
  error: { code: string; message: string }
}

// `baseURL` defaults to the relative '/api/v1', which relies on
// vite.config.ts's dev proxy in development and on the client being served
// from the same origin as the API in production. VITE_API_URL overrides this
// for a split deployment (e.g. client on Vercel, server on Render), where
// the client and server are on different origins and a relative path would
// resolve against the client's own domain instead. Set to the server's full
// origin, e.g. https://sana-server.onrender.com/api/v1.
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/v1'

// This is the single Axios instance that every feature's API calls go
// through. `withCredentials: true` lets the browser send and receive the
// secure refresh-token cookie that the backend sets on login (see
// server/src/controllers/auth.controller.ts) — required across origins too,
// as long as the server's cookie is sameSite: 'none' there.
export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
})

// The current access token is stored here, not in React state. This file
// doesn't depend on React at all, so the interceptors below can read and
// write the token immediately on every request without needing to reach
// into a React context. AuthProvider (src/features/auth/AuthContext.tsx) is
// the only thing that calls setAccessToken(), and it does so right after
// login, a token refresh, or logout.
let accessToken: string | null = null
export function setAccessToken(token: string | null) {
  accessToken = token
}
// This is the read-only counterpart to setAccessToken. It's used by
// lib/socket.ts so the Socket.IO connection can always send whatever the
// current access token is (it's read fresh on every connection attempt,
// not captured once and reused), without storing the token a second time
// somewhere else.
export function getAccessToken(): string | null {
  return accessToken
}

// AuthProvider calls this once to register its own logout function here.
// That way, when a silent token refresh fails (because the refresh cookie
// itself expired or was revoked), this file can trigger a logout and
// redirect without importing React Router or the auth context directly —
// doing that directly would create a circular import, since api.ts would
// import AuthContext, which itself imports api.ts.
let onAuthExpired: (() => void) | null = null
export function setOnAuthExpired(handler: () => void) {
  onAuthExpired = handler
}

// Attaches the current access token to every outgoing request. This matches
// what the backend's `auth` middleware expects to find in the request
// (see server/src/middleware/auth.ts).
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`
  }
  return config
})

// Adds a flag to Axios's request settings marking "this request has
// already been retried once after a token refresh." Without this flag, a
// request that fails again even after a successful refresh — for example,
// because the user genuinely doesn't have permission — would keep looping
// forever between failing with a 401 and retrying the refresh.
interface RetryableConfig extends InternalAxiosRequestConfig {
  _retried?: boolean
}

// This is one shared "refresh in progress" promise, used by every request
// that hits a 401 error at the same time. Without sharing it, if 5 requests
// failed at once, each one would separately call /auth/refresh, and they'd
// end up racing to replace the same refresh cookie (see
// server/src/services/auth.service.ts's rotateRefreshToken, which
// invalidates the previous refresh token every time it's called).
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

// When a request comes back with a 401 error (meaning the access token
// expired or is invalid), this quietly tries to refresh the token once and
// then replays the original request. This is what keeps a user logged in
// past the access token's 15-minute lifetime without ever showing them a
// login prompt again, as long as their refresh cookie (which lasts 7 days)
// is still valid.
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

// Pulls the human-readable message out of a failed API call. Every backend
// error follows the { success: false, error: { code, message } } shape, so
// this is the one place that reads it out, instead of every place that
// makes an API call having to reach into `err.response.data.error.message`
// by hand.
export function getApiErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as ApiError | undefined
    if (data?.error?.message) return data.error.message
  }
  return 'Something went wrong. Please try again.'
}
