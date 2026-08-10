import type { NextFunction, Request, Response } from 'express'
import mongoSanitize from 'mongo-sanitize'

// Strips any object keys starting with '$' or containing '.' from incoming
// request data. Without this, an attacker could send something like
// { "email": { "$gt": "" } } as a login field and manipulate the MongoDB
// query in unexpected ways (a NoSQL injection attack). Registered globally
// in app.ts so every route is protected automatically.
export function sanitize(req: Request, _res: Response, next: NextFunction) {
  if (req.body) req.body = mongoSanitize(req.body)
  if (req.params) req.params = mongoSanitize(req.params)
  // Note: req.query is read-only in Express 5 (no setter), so it's
  // intentionally not reassigned here — query params are validated per-route instead.
  next()
}
