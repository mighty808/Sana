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

// A thrown error that carries an HTTP status and machine-readable code.
// Service/controller code throws this for expected failure cases (e.g. "not found",
// "wrong password") and the global error handler middleware turns it into the
// standard { success: false, error } response automatically — no res.json() needed
// at the call site.
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

// True if `err` is a MongoDB duplicate-key error (code 11000) — thrown when
// an insert/update violates a `unique: true` schema constraint (e.g. two
// departments with the same name, two users with the same email). Services
// that write to a unique field should catch this and re-throw as an
// AppError(..., 409, '<SOMETHING>_EXISTS') instead of letting the raw driver
// error reach the client as a generic 500. Shared here so this check is
// written once instead of duplicated in every service that needs it.
export function isDuplicateKeyError(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && 'code' in err && err.code === 11000)
}

// Throws a clean 400 AppError if `id` isn't a syntactically valid MongoDB
// ObjectId. Route-level `:id` params are already covered by
// middleware/validateObjectId.ts, but request BODIES can also contain
// ObjectId references (e.g. an appointment's `patient`/`doctor`/`department`
// fields) which Zod's `z.string()` alone doesn't validate as ObjectIds.
// Without this check, passing garbage like `{ "patient": "not-an-id" }`
// would reach Mongoose and throw an uncaught CastError (500) instead of a
// clean, expected 400 — the same class of bug the route-param middleware fixes.
export function assertValidObjectId(id: string, label: string): void {
  if (!isValidObjectId(id)) {
    throw new AppError(`'${label}' is not a valid id`, 400, 'INVALID_ID')
  }
}
