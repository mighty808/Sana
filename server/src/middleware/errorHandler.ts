import type { NextFunction, Request, Response } from 'express'
import { AppError } from '../utils/apiResponse.js'
import { logger } from '../utils/logger.js'

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ success: false, error: { code: err.code, message: err.message } })
  }

  logger.error(err)
  return res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' },
  })
}
