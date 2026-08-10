import type { AuthedUser } from './user.js'

// Augments Express's built-in Request type to add an optional `user` field.
// This is what lets `req.user` be typed correctly (instead of `any`) in every
// controller and middleware after the `auth` middleware has run, without
// needing to redeclare it in every file.
declare global {
  namespace Express {
    interface Request {
      user?: AuthedUser
    }
  }
}
