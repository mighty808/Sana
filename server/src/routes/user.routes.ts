import { Router } from 'express'
import { auth } from '../middleware/auth.js'
import { requirePermission } from '../middleware/rbac.js'
import { validate } from '../middleware/validate.js'
import { createUserSchema } from '../schemas/auth.js'
import * as ctrl from '../controllers/user.controller.js'

const router = Router()

// Mounted at /api/v1/users in routes/index.ts.

// Any logged-in user can fetch their own profile.
router.get('/me', auth, ctrl.me)

// Only users whose role has 'user.manage' (i.e. Admin) can list all accounts...
router.get('/', auth, requirePermission('user.manage'), ctrl.list)

// ...or create new ones. Body is Zod-validated before reaching the controller.
router.post('/', auth, requirePermission('user.manage'), validate(createUserSchema), ctrl.create)

export default router
