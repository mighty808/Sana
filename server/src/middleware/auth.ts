import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import { User } from '../models/User.js'
import { fail } from '../utils/apiResponse.js'

// This is the data stored inside a signed access token (see auth.service.ts).
// We only put the user's id in the token, nothing else. On every request we
// look the user back up in the database using that id, and load their current
// role at the same time. That way, if an admin changes a user's role or
// permissions, the change applies right away instead of waiting for the old
// token to expire.
interface AccessTokenPayload {
  id: string
}

// Express middleware that checks the caller is logged in.
// It reads the "Authorization: Bearer <token>" header, checks the JWT is
// valid, loads the matching user (with their role attached) from MongoDB, and
// saves that user on `req.user` so later middleware and controllers can use
// it. Any route that needs a logged-in user should list `auth` before its
// handler function.
export const auth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // "Authorization: Bearer <token>" — split on space and take the token part.
    const token = req.headers.authorization?.split(' ')[1]
    if (!token) return fail(res, 'UNAUTHORIZED', 'Missing access token', 401)

    // This throws an error if the token is malformed, expired, or was signed
    // with the wrong secret. Any of those cases get caught by the try/catch below.
    const decoded = jwt.verify(token, env.jwtAccessSecret) as AccessTokenPayload

    // Look the user up fresh from the database rather than trusting anything
    // baked into the token, and load their role at the same time so
    // `.role.permissions` is ready for the permission-check middleware later
    // in the chain.
    const user = await User.findById(decoded.id).populate('role')
    if (!user || user.status !== 'ACTIVE') {
      return fail(res, 'UNAUTHORIZED', 'Invalid or inactive account', 401)
    }

    // Save the logged-in user on the request object so later middleware and
    // controllers can use it.
    req.user = user as unknown as Request['user']
    next()
  } catch {
    // This covers a missing token, an invalid or expired token, or a failure
    // while looking up the user.
    return fail(res, 'UNAUTHORIZED', 'Invalid or expired access token', 401)
  }
}
