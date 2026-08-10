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

// GET /departments — any authenticated user can view the ACTIVE list (e.g.
// to pick a department when booking an appointment). `?all=true` additionally
// includes INACTIVE departments — restricted to callers whose role actually
// has 'department.manage' (Admin), since that's the same permission
// required to create/edit departments; without this check, any logged-in
// role (including PATIENT) could pass ?all=true and see data meant only for
// the admin management screen. A caller without the permission who passes
// ?all=true is not an error — the flag is just silently ignored and they
// get the normal ACTIVE-only list.
export async function list(req: Request, res: Response) {
  const canManage = req.user?.role?.permissions?.includes('department.manage') ?? false
  const includeInactive = canManage && req.query.all === 'true'
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
