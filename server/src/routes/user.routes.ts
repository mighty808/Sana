import { Router } from 'express'
import { auth } from '../middleware/auth.js'
import { requirePermission } from '../middleware/rbac.js'
import { validate } from '../middleware/validate.js'
import { createUserSchema } from '../schemas/auth.js'
import * as ctrl from '../controllers/user.controller.js'

const router = Router()

// Mounted at /api/v1/users in routes/index.ts.

/**
 * @openapi
 * /users/me:
 *   get:
 *     summary: Get the currently authenticated user's own profile
 *     tags: [Users]
 *     responses:
 *       200:
 *         description: Public user profile (no passwordHash/tokenVersion/etc).
 *       401:
 *         description: Missing or invalid access token.
 */
// Any logged-in user can fetch their own profile.
router.get('/me', auth, ctrl.me)

/**
 * @openapi
 * /users:
 *   get:
 *     summary: List all user accounts (admin only)
 *     tags: [Users]
 *     responses:
 *       200:
 *         description: List of public user profiles.
 *       403:
 *         description: Caller's role lacks the 'user.manage' permission.
 *   post:
 *     summary: Create a new user account (admin only)
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, firstName, lastName, role]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 8 }
 *               firstName: { type: string }
 *               lastName: { type: string }
 *               phone: { type: string }
 *               role: { type: string, enum: [ADMIN, DOCTOR, NURSE, PATIENT] }
 *     responses:
 *       201:
 *         description: Created user's public profile.
 *       409:
 *         description: Email already in use.
 */
// Only users whose role has 'user.manage' (i.e. Admin) can list all accounts...
router.get('/', auth, requirePermission('user.manage'), ctrl.list)

// ...or create new ones. Body is Zod-validated before reaching the controller.
router.post('/', auth, requirePermission('user.manage'), validate(createUserSchema), ctrl.create)

export default router
