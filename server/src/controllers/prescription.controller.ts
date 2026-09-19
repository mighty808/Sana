import type { Request, Response } from 'express'
import * as prescriptionService from '../services/prescription.service.js'
import * as auditService from '../services/audit.service.js'
import { ok } from '../utils/apiResponse.js'

// GET /prescriptions?status= — requires 'prescription.read'. Role-scoped —
// see prescription.service.ts's listPrescriptions for exactly how.
export async function list(req: Request, res: Response) {
  const statusFilter = typeof req.query.status === 'string' ? req.query.status : undefined
  const prescriptions = await prescriptionService.listPrescriptions(req.user!, statusFilter)
  return ok(res, prescriptions)
}

// PATCH /prescriptions/:id/dispense — requires 'prescription.dispense' (Pharmacist only).
export async function dispense(req: Request, res: Response) {
  const prescription = await prescriptionService.dispensePrescription(req.params.id as string, req.user!.id)
  await auditService.logAction(req, req.user!.id, 'PRESCRIPTION_DISPENSED', 'Prescription', prescription.id)
  return ok(res, prescription)
}
