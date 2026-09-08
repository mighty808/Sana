import type { NextFunction, Request, Response } from 'express'
import { isValidObjectId } from 'mongoose'
import { fail } from '../utils/apiResponse.js'

// Rejects a request early with a clean 400 error if the given route
// parameter isn't a validly formatted MongoDB ObjectId. Without this check,
// passing something like "/patients/not-an-id" would reach Mongoose, which
// throws its own internal error that isn't one of our AppErrors. That error
// would fall through to the generic error handler and come back as a
// confusing 500 error with a scary stack trace logged, instead of a clean
// 4xx response explaining what went wrong.
//
// Usage: router.get('/:id', auth, validateObjectId('id'), ctrl.getById)
// This same check is reused on every route that takes an `:id` parameter
// (patients, appointments, and everything else), instead of repeating the
// same check inside each individual service function.
export const validateObjectId = (paramName: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const value = req.params[paramName]
    if (!value || !isValidObjectId(value)) {
      return fail(res, 'INVALID_ID', `'${paramName}' is not a valid id`, 400)
    }
    next()
  }
}
