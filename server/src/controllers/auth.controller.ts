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
  httpOnly: true, // JavaScript running in the browser can't read this cookie, which helps stop attackers from stealing the token through malicious scripts
  secure: env.nodeEnv === 'production', // only sent over HTTPS in production
  // 'lax' in dev, where the client and server share an origin via the Vite
  // proxy. In production the client (Vercel) and server (Render) are on
  // different origins, and a Lax cookie is never sent on a cross-site
  // fetch/XHR call at all — only on a top-level navigation — so the silent
  // refresh in client/src/lib/api.ts would fail 100% of the time in
  // production with 'lax'. 'None' requires 'secure: true', which is already
  // the case in production above.
  sameSite: env.nodeEnv === 'production' ? ('none' as const) : ('lax' as const),
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
    // Log the failed attempt, including the email that was tried. There's no
    // user id to log because login may have failed before we could match it
    // to a real account. We then re-throw the error so the global error
    // handler still sends back the 401 response.
    await auditService.logAction(req, undefined, 'LOGIN_FAILURE', 'User', undefined, { email })
    throw err
  }
}

// POST /auth/refresh
// Reads the refresh token from its cookie, checks that it's valid, and
// issues a new access token and refresh token pair (updating the cookie
// too). No `auth` middleware is needed here because the refresh cookie
// itself acts as the proof of identity.
export async function refresh(req: Request, res: Response) {
  const token = req.cookies?.[REFRESH_COOKIE]
  if (!token) return fail(res, 'UNAUTHORIZED', 'Missing refresh token', 401)

  const { user, accessToken, refreshToken } = await authService.rotateRefreshToken(token)
  res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions)
  return ok(res, { accessToken, user: authService.toPublicUser(user) })
}

// POST /auth/logout
// Requires `auth` middleware because it needs to know who is logging out.
// Invalidates all of that user's refresh tokens on the server and clears
// the cookie in the browser.
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
    // There's no email-sending service set up yet, so we log the token
    // instead. That lets the reset flow still be tested from start to
    // finish by grabbing the token from the server logs.
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
