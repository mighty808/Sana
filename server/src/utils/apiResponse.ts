import type { Response } from 'express'
import { isValidObjectId } from 'mongoose'

// Sends a successful API response in Sana's standard shape: { success: true, data }.
// `status` defaults to 200 but callers can pass 201 (created), etc.
export function ok<T>(res: Response, data: T, status = 200) {
  return res.status(status).json({ success: true, data })
}

// Sends a failed API response in Sana's standard shape: { success: false, error: { code, message } }.
// `code` is a short machine-readable string (e.g. 'PATIENT_NOT_FOUND') the frontend
// can switch on; `message` is human-readable text safe to show to the user.
export function fail(res: Response, code: string, message: string, status = 400) {
  return res.status(status).json({ success: false, error: { code, message } })
}

// An error object that carries an HTTP status and a machine-readable code
// along with its message. Service and controller code throws this for
// expected failure cases (e.g. "not found", "wrong password"). The global
// error handler middleware catches it and turns it into the standard
// { success: false, error } response automatically, so the code that throws
// it doesn't need to call res.json() itself.
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

// Returns true if `err` is a MongoDB duplicate-key error (code 11000).
// MongoDB throws this when an insert or update would violate a
// `unique: true` schema constraint (for example, two users with the same
// email). Services that write to a unique field should catch this and
// re-throw it as an AppError(..., 409, '<SOMETHING>_EXISTS') instead of
// letting the raw database error reach the client as a generic 500. This
// check lives here once so it doesn't need to be rewritten in every service
// that needs it.
export function isDuplicateKeyError(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && 'code' in err && err.code === 11000)
}

// Throws a clean 400 AppError if `id` isn't validly formatted as a MongoDB
// ObjectId. Route-level `:id` params are already checked by
// middleware/validateObjectId.ts, but request BODIES can also contain
// ObjectId references (e.g. an appointment's `patient`/`doctor` fields), and
// Zod's `z.string()` alone doesn't check that a string is a valid ObjectId.
// Without this check, sending something like `{ "patient": "not-an-id" }`
// would reach Mongoose and cause an unhandled error (a generic 500) instead
// of the clean, expected 400 response — the same problem the route-param
// middleware already fixes for URL params.
export function assertValidObjectId(id: string, label: string): void {
  if (!isValidObjectId(id)) {
    throw new AppError(`'${label}' is not a valid id`, 400, 'INVALID_ID')
  }
}
