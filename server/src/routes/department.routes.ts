import { Router } from 'express'
import { auth } from '../middleware/auth.js'
import { requirePermission } from '../middleware/rbac.js'
import { validate } from '../middleware/validate.js'
import { validateObjectId } from '../middleware/validateObjectId.js'
import { createDepartmentSchema, updateDepartmentSchema } from '../schemas/department.js'
import * as ctrl from '../controllers/department.controller.js'

const router = Router()

// Mounted at /api/v1/departments in routes/index.ts.

/**
 * @openapi
 * /departments:
 *   get:
 *     summary: List departments
 *     tags: [Departments]
 *     parameters:
 *       - in: query
 *         name: all
 *         schema: { type: string, enum: ['true', 'false'] }
 *         description: Pass "true" to also include INACTIVE departments (admin management screen).
 *     responses:
 *       200:
 *         description: List of departments.
 *   post:
 *     summary: Create a department
 *     tags: [Departments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string }
 *               description: { type: string }
 *     responses:
 *       201:
 *         description: Department created.
 *       409:
 *         description: A department with that name already exists.
 */
// Any logged-in user can view the department list (needed to populate
// dropdowns when booking appointments, filtering dashboards, etc).
router.get('/', auth, ctrl.list)

// Only Admin (the sole role with 'department.manage') can create/edit departments.
router.post('/', auth, requirePermission('department.manage'), validate(createDepartmentSchema), ctrl.create)

/**
 * @openapi
 * /departments/{id}:
 *   patch:
 *     summary: Update a department (name, description, or active status)
 *     tags: [Departments]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               description: { type: string }
 *               status: { type: string, enum: [ACTIVE, INACTIVE] }
 *     responses:
 *       200:
 *         description: Updated department.
 *       404:
 *         description: Department not found.
 */
router.patch(
  '/:id',
  auth,
  validateObjectId('id'),
  requirePermission('department.manage'),
  validate(updateDepartmentSchema),
  ctrl.update,
)

export default router
