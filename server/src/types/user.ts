import type { UserDoc } from '../models/User.js'
import type { RoleDoc } from '../models/Role.js'

// The shape of `req.user` after the `auth` middleware runs: a hydrated User
// document, but with its `role` field replaced by the fully populated Role
// document (rather than just a raw ObjectId reference), since auth.ts always
// calls `.populate('role')` before attaching the user to the request.
export type AuthedUser = Omit<UserDoc, 'role'> & { role: RoleDoc }

// Field allowlist for `.populate('doctor', PUBLIC_USER_FIELDS)` (or any
// other User reference, e.g. a future 'recordedBy'/'performedBy') wherever a
// User document gets embedded into a response the requester didn't
// necessarily create themselves. WITHOUT restricting fields, a plain
// `.populate('doctor')` pulls the ENTIRE User document — including
// passwordHash and tokenVersion — straight into the JSON response. Using
// one shared constant here (instead of retyping the field list at every
// populate() call site) means there's a single place to update if the
// definition of "safe to expose" ever changes.
export const PUBLIC_USER_FIELDS = 'firstName lastName email'
