import type { NextFunction, Request, Response } from 'express'
import type { ZodType } from 'zod'
import { fail } from '../utils/apiResponse.js'

// This function builds an Express middleware that checks `req.body` against
// a given Zod schema before the request reaches the controller. Because of
// this, controllers don't need to write their own validation code: by the
// time a controller runs, req.body is guaranteed to have the shape and types
// the schema expects.
//
// Usage: router.post('/', validate(loginSchema), ctrl.login)
export const validate = (schema: ZodType) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // safeParse never throws an error. Instead it returns a result object we
    // can check, which is simpler than using try/catch for validation
    // failures we expect to happen sometimes.
    const result = schema.safeParse(req.body)
    if (!result.success) {
      // Status 422 means the request was valid JSON but didn't pass our
      // validation rules. We join all the individual error messages into one
      // readable string.
      return fail(res, 'VALIDATION_ERROR', result.error.issues.map((i) => i.message).join(', '), 422)
    }
    // Replace req.body with the cleaned-up data Zod produced (for example,
    // with .trim() or .toLowerCase() already applied), so the rest of the
    // request-handling code gets the cleaned-up version instead of the raw input.
    req.body = result.data
    next()
  }
}
