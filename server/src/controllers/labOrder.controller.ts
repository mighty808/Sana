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

// GET /lab-orders?status=&encounter= — requires 'laborder.read'.
// If `encounter` is given, this switches to listLabOrdersForEncounter,
// which also includes each order's results and is gated by whether the
// caller may read that encounter at all (see its own comment). This is
// what powers the Encounter page's "Lab results" section. Without
// `encounter`, listLabOrders() narrows the plain queue down by role — see
// the comment there.
export async function list(req: Request, res: Response) {
  const encounterId = typeof req.query.encounter === 'string' ? req.query.encounter : undefined
  if (encounterId) {
    const orders = await labOrderService.listLabOrdersForEncounter(encounterId, req.user!)
    return ok(res, orders)
  }

  const statusFilter = typeof req.query.status === 'string' ? req.query.status : undefined
  const orders = await labOrderService.listLabOrders(req.user!, statusFilter)
  return ok(res, orders)
}

// GET /lab-orders/:id — requires 'laborder.read'.
export async function getById(req: Request, res: Response) {
  const result = await labOrderService.getLabOrderById(req.params.id as string, req.user!)
  return ok(res, result)
}

// PATCH /lab-orders/:id — requires 'laborder.update' (Doctor only, and only
// the ordering doctor, and only while still ORDERED).
export async function update(req: Request, res: Response) {
  const order = await labOrderService.updateLabOrder(req.params.id as string, req.user!.id, req.body)
  await auditService.logAction(req, req.user!.id, 'LAB_ORDER_UPDATED', 'LabOrder', order.id, {
    tests: order.tests.map((t) => t.testName),
  })
  return ok(res, order)
}

// DELETE /lab-orders/:id — requires 'laborder.delete' (Doctor only, and only
// the ordering doctor, and only while still ORDERED).
export async function remove(req: Request, res: Response) {
  const order = await labOrderService.deleteLabOrder(req.params.id as string, req.user!.id)
  await auditService.logAction(req, req.user!.id, 'LAB_ORDER_DELETED', 'LabOrder', order.id, {
    tests: order.tests.map((t) => t.testName),
  })
  return ok(res, order)
}
