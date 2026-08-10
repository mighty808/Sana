import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import { User } from '../models/User.js'
import { fail } from '../utils/apiResponse.js'

// Shape of the data we embed inside a signed access token (see auth.service.ts).
// We deliberately keep this minimal — just the user id — and re-fetch the full
// user + role from the database on every request, so permission changes (e.g.
// an admin editing a role's permissions) take effect immediately instead of
// waiting for the token to expire.
interface AccessTokenPayload {
  id: string
}

// Express middleware that verifies the caller is logged in.
// Reads the "Authorization: Bearer <token>" header, verifies the JWT, loads the
// matching user (with their role populated) from MongoDB, and attaches it to
// `req.user` so downstream middleware/controllers can use it.
// Any route that needs a logged-in user should list `auth` before its handler.
export const auth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // "Authorization: Bearer <token>" — split on space and take the token part.
    const token = req.headers.authorization?.split(' ')[1]
    if (!token) return fail(res, 'UNAUTHORIZED', 'Missing access token', 401)

    // Throws if the token is malformed, expired, or signed with the wrong secret —
    // caught by the try/catch below.
    const decoded = jwt.verify(token, env.jwtAccessSecret) as AccessTokenPayload

    // Look up the user fresh from the DB (not trusting stale data baked into the
    // token) and populate their role so `.role.permissions` is available to the
    // RBAC middleware later in the chain.
    const user = await User.findById(decoded.id).populate('role')
    if (!user || user.status !== 'ACTIVE') {
      return fail(res, 'UNAUTHORIZED', 'Invalid or inactive account', 401)
    }

    // Attach the authenticated user to the request object for later middleware/controllers.
    req.user = user as unknown as Request['user']
    next()
  } catch {
    // Covers: missing/invalid/expired token, or user lookup failure.
    return fail(res, 'UNAUTHORIZED', 'Invalid or expired access token', 401)
  }
}
