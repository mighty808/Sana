import type { NextFunction, Request, Response } from 'express'
import mongoSanitize from 'mongo-sanitize'

// Removes any object keys that start with '$' or contain '.' from incoming
// request data. Without this, an attacker could send something like
// { "email": { "$gt": "" } } as a login field and use it to change what a
// MongoDB query actually does (this kind of attack is called NoSQL
// injection). This middleware is registered globally in app.ts, so every
// route is protected automatically.
export function sanitize(req: Request, _res: Response, next: NextFunction) {
  if (req.body) req.body = mongoSanitize(req.body)
  if (req.params) req.params = mongoSanitize(req.params)
  // Note: in Express 5, req.query has no setter, so we can't reassign it the
  // same way. Query parameters are checked per-route instead.
  next()
}
