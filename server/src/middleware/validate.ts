import type { NextFunction, Request, Response } from 'express'
import type { ZodType } from 'zod'
import { fail } from '../utils/apiResponse.js'

// Factory that returns an Express middleware validating `req.body` against a
// given Zod schema, BEFORE the request reaches the controller. This keeps
// controllers free of manual validation code — by the time a controller runs,
// req.body is guaranteed to match the schema's shape and types.
//
// Usage: router.post('/', validate(loginSchema), ctrl.login)
export const validate = (schema: ZodType) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // safeParse never throws — it returns a result object we can inspect,
    // which is cleaner than try/catch for expected validation failures.
    const result = schema.safeParse(req.body)
    if (!result.success) {
      // 422 Unprocessable Entity: the request was well-formed JSON but failed
      // validation rules. Join all issue messages into one readable string.
      return fail(res, 'VALIDATION_ERROR', result.error.issues.map((i) => i.message).join(', '), 422)
    }
    // Replace req.body with the parsed/coerced data (e.g. Zod's .trim()/.toLowerCase()
    // transforms applied), so downstream code gets the cleaned-up version.
    req.body = result.data
    next()
  }
}
