import type { Request, Response } from 'express'
import * as userService from '../services/user.service.js'
import * as auditService from '../services/audit.service.js'
import { toPublicUser } from '../services/auth.service.js'
import { ok } from '../utils/apiResponse.js'

// GET /users/me
// Returns the currently authenticated user's own profile. Requires only
// `auth` (any logged-in role can see their own info), not a specific permission.
export async function me(req: Request, res: Response) {
  return ok(res, toPublicUser(req.user!))
}

// POST /users
// Admin-only (enforced by requirePermission('user.manage') in the route).
// Creates a new account for a doctor, nurse, patient, or another admin.
export async function create(req: Request, res: Response) {
  const user = await userService.createUser(req.body)
  await auditService.logAction(req, req.user!.id, 'USER_CREATED', 'User', user.id, { role: req.body.role })
  return ok(res, toPublicUser(user), 201)
}

// GET /users
// Admin-only. Lists every account in the system, for the "manage users" screen.
export async function list(_req: Request, res: Response) {
  const users = await userService.listUsers()
  return ok(res, users.map((u) => toPublicUser(u)))
}
