import type { NextFunction, Request, Response } from 'express'
import type { Permission } from '../types/permissions.js'
import { fail } from '../utils/apiResponse.js'

// This function builds an Express middleware that checks for one specific
// permission string, such as 'encounter.create'. It must run AFTER the
// `auth` middleware, because it needs `req.user` to already be filled in
// with the user's role.
//
// Usage: router.post('/', auth, requirePermission('encounter.create'), ctrl.create)
export const requirePermission = (permission: Permission) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // req.user.role.permissions is the list of permission strings assigned
    // to this user's role (set up in utils/seed.ts). If the required
    // permission isn't in that list, we reject the request with 403
    // Forbidden before the controller ever runs.
    if (!req.user?.role?.permissions?.includes(permission)) {
      return fail(res, 'FORBIDDEN', `Missing permission: ${permission}`, 403)
    }
    next()
  }
}
