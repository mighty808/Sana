import type { Request, Response } from 'express'
import * as departmentService from '../services/department.service.js'
import * as auditService from '../services/audit.service.js'
import { ok } from '../utils/apiResponse.js'

// POST /departments — admin only (requirePermission('department.manage') in the route).
export async function create(req: Request, res: Response) {
  const department = await departmentService.createDepartment(req.body)
  await auditService.logAction(req, req.user!.id, 'DEPARTMENT_CREATED', 'Department', department.id)
  return ok(res, department, 201)
}

// GET /departments — any authenticated user can view the list (e.g. to pick
// a department when booking an appointment). `?all=true` additionally
// includes INACTIVE departments, meant for the admin management screen.
export async function list(req: Request, res: Response) {
  const includeInactive = req.query.all === 'true'
  const departments = await departmentService.listDepartments(includeInactive)
  return ok(res, departments)
}

// PATCH /departments/:id — admin only.
// (`as string` — see the identical note in patient.controller.ts.)
export async function update(req: Request, res: Response) {
  const department = await departmentService.updateDepartment(req.params.id as string, req.body)
  await auditService.logAction(req, req.user!.id, 'DEPARTMENT_UPDATED', 'Department', department.id, req.body)
  return ok(res, department)
}
