import type { Request, Response } from 'express'
import * as analyticsService from '../services/analytics.service.js'
import { ok } from '../utils/apiResponse.js'

// GET /analytics/dashboard — requires 'analytics.read' (every role holds
// this by default). Returns a different shape of summary data depending on
// the caller's role — see getDashboard()'s branching in analytics.service.ts.
export async function dashboard(req: Request, res: Response) {
  const data = await analyticsService.getDashboard(req.user!)
  return ok(res, data)
}
