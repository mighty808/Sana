import { Router } from 'express'
import { auth } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { loginRateLimiter } from '../middleware/rateLimiter.js'
import { loginSchema, forgotPasswordSchema, resetPasswordSchema } from '../schemas/auth.js'
import * as ctrl from '../controllers/auth.controller.js'

const router = Router()

// Mounted at /api/v1/auth in routes/index.ts, so these become:
// POST /api/v1/auth/login, /refresh, /logout, /forgot-password, /reset-password

// Public — rate-limited to slow brute-force guessing, body validated by Zod
// before the controller ever runs.
router.post('/login', loginRateLimiter, validate(loginSchema), ctrl.login)

// Public — the refresh token cookie itself is the credential here, so no
// `auth` middleware (which expects a Bearer access token) is needed.
router.post('/refresh', ctrl.refresh)

// Requires a valid access token — you must be logged in to log out.
router.post('/logout', auth, ctrl.logout)

// Public, rate-limited (same reason as login — don't let it be spammed).
router.post('/forgot-password', loginRateLimiter, validate(forgotPasswordSchema), ctrl.forgotPassword)

// Public — the reset token itself (not a login session) authorizes this request.
router.post('/reset-password', validate(resetPasswordSchema), ctrl.resetPassword)

export default router
