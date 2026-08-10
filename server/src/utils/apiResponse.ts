import type { Response } from 'express'

export function ok<T>(res: Response, data: T, status = 200) {
  return res.status(status).json({ success: true, data })
}

export function fail(res: Response, code: string, message: string, status = 400) {
  return res.status(status).json({ success: false, error: { code, message } })
}

export class AppError extends Error {
  constructor(
    message: string,
    public status = 500,
    public code = 'INTERNAL_ERROR',
  ) {
    super(message)
    this.name = 'AppError'
  }
}
