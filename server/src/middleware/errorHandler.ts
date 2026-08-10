import type { NextFunction, Request, Response } from 'express'
import { AppError } from '../utils/apiResponse.js'
import { logger } from '../utils/logger.js'

// Express's global error-handling middleware — must be registered LAST in app.ts
// (after all routes) and must keep all four parameters (err, req, res, next) even
// though `next` and `_req` are unused, because Express detects an error handler
// specifically by its 4-argument function signature.
//
// Any error thrown (or rejected promise) inside a route handler ends up here,
// so individual controllers never need their own try/catch + res.json() boilerplate.
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  // Expected, "known" errors (e.g. "invalid password", "not found") were thrown
  // deliberately by our own code as AppError, so we trust their status/message
  // and send them straight to the client.
  if (err instanceof AppError) {
    return res.status(err.status).json({ success: false, error: { code: err.code, message: err.message } })
  }

  // Anything else is unexpected (a bug, a driver error, etc). Log the full error
  // for debugging, but never leak internal details (stack traces, DB errors) to
  // the client — just a generic 500 message.
  logger.error(err)
  return res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' },
  })
}
