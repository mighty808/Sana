import type { NextFunction, Request, Response } from 'express'
import { AppError } from '../utils/apiResponse.js'
import { logger } from '../utils/logger.js'

// This is Express's catch-all error handler. It must be registered LAST in
// app.ts, after all the routes, and it must keep all four parameters (err,
// req, res, next) even though `next` and `_req` are not used. Express only
// recognizes a function as an error handler when it has exactly four
// parameters, so removing the unused ones would break it.
//
// Any error thrown, or any rejected promise, inside a route handler ends up
// here. That means individual controllers don't need to write their own
// try/catch and res.json() code every time.
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  // If the error is an AppError, it's an "expected" error that our own code
  // threw on purpose (things like "invalid password" or "not found"). We
  // trust its status code and message and send them straight to the client.
  if (err instanceof AppError) {
    return res.status(err.status).json({ success: false, error: { code: err.code, message: err.message } })
  }

  // Anything else is unexpected — a bug, a database error, or something we
  // didn't plan for. We log the full error for our own debugging, but we
  // never show internal details like stack traces or database errors to the
  // client. The client just gets a generic 500 message.
  logger.error(err)
  return res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' },
  })
}
