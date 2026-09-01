import type { Request, Response } from 'express'
import * as analyticsService from '../services/analytics.service.js'
import { ok } from '../utils/apiResponse.js'

// GET /analytics/dashboard — requires 'analytics.read' (every role holds
// this by default). The summary data returned looks different depending on
// the caller's role — see getDashboard() in analytics.service.ts for how that's decided.
export async function dashboard(req: Request, res: Response) {
  const data = await analyticsService.getDashboard(req.user!)
  return ok(res, data)
}
