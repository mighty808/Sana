import type { Request, Response } from 'express'
import * as labOrderService from '../services/labOrder.service.js'
import * as auditService from '../services/audit.service.js'
import { ok } from '../utils/apiResponse.js'

// POST /lab-orders — requires 'laborder.create' (Doctor only).
export async function create(req: Request, res: Response) {
  const order = await labOrderService.createLabOrder(req.body, req.user!.id)
  await auditService.logAction(req, req.user!.id, 'LAB_ORDER_CREATED', 'LabOrder', order.id, {
    labOrderNumber: order.labOrderNumber,
    tests: order.tests.map((t) => t.testName),
  })
  return ok(res, order, 201)
}

// GET /lab-orders?status= — requires 'laborder.read' (Admin, Doctor).
// listLabOrders() itself narrows by role — see the comment there.
export async function list(req: Request, res: Response) {
  const statusFilter = typeof req.query.status === 'string' ? req.query.status : undefined
  const orders = await labOrderService.listLabOrders(req.user!, statusFilter)
  return ok(res, orders)
}

// GET /lab-orders/:id — requires 'laborder.read'.
export async function getById(req: Request, res: Response) {
  const result = await labOrderService.getLabOrderById(req.params.id as string)
  return ok(res, result)
}
