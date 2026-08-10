import { Router } from 'express'
import { auth } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { loginRateLimiter } from '../middleware/rateLimiter.js'
import { loginSchema, forgotPasswordSchema, resetPasswordSchema } from '../schemas/auth.js'
import * as ctrl from '../controllers/auth.controller.js'

const router = Router()

// Mounted at /api/v1/auth in routes/index.ts, so these become:
// POST /api/v1/auth/login, /refresh, /logout, /forgot-password, /reset-password

/**
 * @openapi
 * /auth/login:
 *   post:
 *     summary: Log in with email + password
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: Access token + public user profile. Refresh token is set as an HTTP-only cookie.
 *       401:
 *         description: Invalid credentials.
 */
// Public — rate-limited to slow brute-force guessing, body validated by Zod
// before the controller ever runs.
router.post('/login', loginRateLimiter, validate(loginSchema), ctrl.login)

/**
 * @openapi
 * /auth/refresh:
 *   post:
 *     summary: Exchange the refresh token cookie for a new access token
 *     tags: [Auth]
 *     security: []
 *     responses:
 *       200:
 *         description: New access token issued; refresh cookie rotated.
 *       401:
 *         description: Missing, invalid, or expired refresh token.
 */
// Public — the refresh token cookie itself is the credential here, so no
// `auth` middleware (which expects a Bearer access token) is needed.
router.post('/refresh', ctrl.refresh)

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     summary: Log out (invalidates all refresh tokens for this user)
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Logged out.
 */
// Requires a valid access token — you must be logged in to log out.
router.post('/logout', auth, ctrl.logout)

/**
 * @openapi
 * /auth/forgot-password:
 *   post:
 *     summary: Request a password reset token
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *     responses:
 *       200:
 *         description: Generic success message (does not reveal whether the email is registered).
 */
// Public, rate-limited (same reason as login — don't let it be spammed).
router.post('/forgot-password', loginRateLimiter, validate(forgotPasswordSchema), ctrl.forgotPassword)

/**
 * @openapi
 * /auth/reset-password:
 *   post:
 *     summary: Reset password using the token from forgot-password
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, newPassword]
 *             properties:
 *               token: { type: string }
 *               newPassword: { type: string, minLength: 8 }
 *     responses:
 *       200:
 *         description: Password updated.
 *       400:
 *         description: Invalid or expired reset token.
 */
// Public — the reset token itself (not a login session) authorizes this request.
router.post('/reset-password', validate(resetPasswordSchema), ctrl.resetPassword)

export default router
