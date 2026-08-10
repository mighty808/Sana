import type { UserDoc } from '../models/User.js'
import type { RoleDoc } from '../models/Role.js'

// The shape of `req.user` after the `auth` middleware runs: a hydrated User
// document, but with its `role` field replaced by the fully populated Role
// document (rather than just a raw ObjectId reference), since auth.ts always
// calls `.populate('role')` before attaching the user to the request.
export type AuthedUser = Omit<UserDoc, 'role'> & { role: RoleDoc }
