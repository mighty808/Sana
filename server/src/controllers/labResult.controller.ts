import type { Request, Response } from 'express'
import * as labResultService from '../services/labResult.service.js'
import * as auditService from '../services/audit.service.js'
import { ok } from '../utils/apiResponse.js'

// POST /lab-results — requires 'labresult.create' (Admin only in this MVP).
export async function create(req: Request, res: Response) {
  const result = await labResultService.createLabResult(req.body, req.user!.id)
  await auditService.logAction(req, req.user!.id, 'LAB_RESULT_ENTERED', 'LabResult', result.id, {
    testName: result.testName,
  })
  return ok(res, result, 201)
}

// GET /lab-results — requires 'labresult.read' (Admin, Doctor, Patient — see
// listLabResults() for how each role's results are scoped/restricted).
export async function list(req: Request, res: Response) {
  const results = await labResultService.listLabResults(req.user!)
  return ok(res, results)
}

// PATCH /lab-results/:id/release — requires 'labresult.release' (Admin only).
export async function release(req: Request, res: Response) {
  const result = await labResultService.releaseLabResult(req.params.id as string, req.user!.id)
  await auditService.logAction(req, req.user!.id, 'LAB_RESULT_RELEASED', 'LabResult', result.id)
  return ok(res, result)
}
