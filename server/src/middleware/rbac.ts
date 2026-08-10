import type { NextFunction, Request, Response } from 'express'
import type { Permission } from '../types/permissions.js'
import { fail } from '../utils/apiResponse.js'

// Factory that returns an Express middleware checking for one specific permission
// string (e.g. 'encounter.create'). Must run AFTER the `auth` middleware, since
// it relies on `req.user` already being populated with the user's role.
//
// Usage: router.post('/', auth, requirePermission('encounter.create'), ctrl.create)
export const requirePermission = (permission: Permission) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // req.user.role.permissions is the array of permission strings assigned to
    // this user's role (seeded in utils/seed.ts). If the required permission
    // isn't in that list, reject with 403 Forbidden before the controller runs.
    if (!req.user?.role?.permissions?.includes(permission)) {
      return fail(res, 'FORBIDDEN', `Missing permission: ${permission}`, 403)
    }
    next()
  }
}
