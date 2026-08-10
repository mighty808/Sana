import type { NextFunction, Request, Response } from 'express'
import { isValidObjectId } from 'mongoose'
import { fail } from '../utils/apiResponse.js'

// Rejects a request early with a clean 400 if the given route param isn't a
// syntactically valid MongoDB ObjectId — WITHOUT this, passing garbage like
// "/patients/not-an-id" reaches Mongoose, which throws a raw CastError that
// isn't an AppError, so it falls through to the generic error handler as an
// unhelpful 500 (with a scary stack trace logged) instead of a clean 4xx.
//
// Usage: router.get('/:id', auth, validateObjectId('id'), ctrl.getById)
// Reused on every current and future `:id` route (patients, departments,
// and every collection added in later phases) instead of duplicating this
// check inside each service function.
export const validateObjectId = (paramName: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const value = req.params[paramName]
    if (!value || !isValidObjectId(value)) {
      return fail(res, 'INVALID_ID', `'${paramName}' is not a valid id`, 400)
    }
    next()
  }
}
