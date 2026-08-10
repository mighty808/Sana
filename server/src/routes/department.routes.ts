import { Router } from 'express'
import { auth } from '../middleware/auth.js'
import { requirePermission } from '../middleware/rbac.js'
import { validate } from '../middleware/validate.js'
import { createDepartmentSchema, updateDepartmentSchema } from '../schemas/department.js'
import * as ctrl from '../controllers/department.controller.js'

const router = Router()

// Mounted at /api/v1/departments in routes/index.ts.

// Any logged-in user can view the department list (needed to populate
// dropdowns when booking appointments, filtering dashboards, etc).
router.get('/', auth, ctrl.list)

// Only Admin (the sole role with 'department.manage') can create/edit departments.
router.post('/', auth, requirePermission('department.manage'), validate(createDepartmentSchema), ctrl.create)
router.patch('/:id', auth, requirePermission('department.manage'), validate(updateDepartmentSchema), ctrl.update)

export default router
