import type { Request, Response } from 'express'
import { env } from '../config/env.js'
import * as authService from '../services/auth.service.js'
import * as auditService from '../services/audit.service.js'
import { ok, fail } from '../utils/apiResponse.js'
import { logger } from '../utils/logger.js'

// Name of the cookie the refresh token is stored in.
const REFRESH_COOKIE = 'refreshToken'

// Shared cookie settings for the refresh token, reused by login/refresh/logout
// so they all set/clear the exact same cookie.
const refreshCookieOptions = {
  httpOnly: true, // not readable by client-side JavaScript — mitigates XSS token theft
  secure: env.nodeEnv === 'production', // only sent over HTTPS in production
  sameSite: 'lax' as const, // basic CSRF protection while still allowing normal navigation
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days, matching JWT_REFRESH_EXPIRES_IN
  path: '/api/v1/auth', // only sent back on auth-related requests, not every API call
}

// POST /auth/login
// Verifies credentials, sets the refresh token as an HTTP-only cookie, and
// returns the access token + public user profile in the JSON body.
export async function login(req: Request, res: Response) {
  const { email, password } = req.body
  try {
    const { user, accessToken, refreshToken } = await authService.login(email, password)
    res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions)
    await auditService.logAction(req, user.id, 'LOGIN_SUCCESS', 'User', user.id)
    return ok(res, { accessToken, user: authService.toPublicUser(user) })
  } catch (err) {
    // Log the failed attempt (with the attempted email, but no user id since
    // login may have failed before we identified a real account) before
    // re-throwing so the global error handler still returns the 401 response.
    await auditService.logAction(req, undefined, 'LOGIN_FAILURE', 'User', undefined, { email })
    throw err
  }
}

// POST /auth/refresh
// Reads the refresh token from its cookie, validates it, and issues a new
// access + refresh token pair (refreshing the cookie too). No `auth` middleware
// needed here since the refresh cookie itself IS the credential.
export async function refresh(req: Request, res: Response) {
  const token = req.cookies?.[REFRESH_COOKIE]
  if (!token) return fail(res, 'UNAUTHORIZED', 'Missing refresh token', 401)

  const { user, accessToken, refreshToken } = await authService.rotateRefreshToken(token)
  res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions)
  return ok(res, { accessToken, user: authService.toPublicUser(user) })
}

// POST /auth/logout
// Requires `auth` middleware (needs to know WHO is logging out). Invalidates
// all of that user's refresh tokens server-side and clears the cookie client-side.
export async function logout(req: Request, res: Response) {
  if (req.user) {
    await authService.logout(req.user.id)
    await auditService.logAction(req, req.user.id, 'LOGOUT', 'User', req.user.id)
  }
  res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' })
  return ok(res, { message: 'Logged out' })
}

// POST /auth/forgot-password
// Always responds with the same generic message regardless of whether the
// email matched an account, to avoid leaking which emails are registered.
export async function forgotPassword(req: Request, res: Response) {
  const { email } = req.body
  const rawToken = await authService.requestPasswordReset(email)
  if (rawToken) {
    // No email service in MVP scope — log the token so the reset flow can
    // still be demonstrated end-to-end (grab it from server logs).
    logger.info(`Password reset token for ${email}: ${rawToken}`)
  }
  return ok(res, { message: 'If that account exists, a reset link has been issued.' })
}

// POST /auth/reset-password
// Consumes the raw token from forgotPassword() above and sets a new password.
export async function resetPassword(req: Request, res: Response) {
  const { token, newPassword } = req.body
  const user = await authService.resetPassword(token, newPassword)
  await auditService.logAction(req, user.id, 'PASSWORD_RESET', 'User', user.id)
  return ok(res, { message: 'Password updated' })
}
