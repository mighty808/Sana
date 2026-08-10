import { User } from '../models/User.js'
import { Role } from '../models/Role.js'
import { hashPassword } from './auth.service.js'
import { AppError } from '../utils/apiResponse.js'
import type { RoleName } from '../types/permissions.js'
import type { AuthedUser } from '../types/user.js'

// Creates a new user account (called by an admin via POST /users — there's
// no public self-registration in this MVP; admin provisions all accounts).
export async function createUser(input: {
  email: string
  password: string
  firstName: string
  lastName: string
  phone?: string
  role: RoleName
}) {
  // Enforce email uniqueness explicitly (in addition to the DB-level unique
  // index) so we can return a clean 409 error instead of a raw Mongo duplicate-key error.
  const existing = await User.findOne({ email: input.email })
  if (existing) throw new AppError('Email already in use', 409, 'EMAIL_TAKEN')

  // Look up the Role document matching the requested role name — this must
  // have been created by the seed script (utils/seed.ts) beforehand.
  const role = await Role.findOne({ name: input.role })
  if (!role) throw new AppError('Role not found — run the seed script', 500, 'ROLE_NOT_FOUND')

  const passwordHash = await hashPassword(input.password)
  const user = await User.create({
    email: input.email,
    passwordHash,
    firstName: input.firstName,
    lastName: input.lastName,
    phone: input.phone,
    role: role._id,
  })

  // Populate the role before returning so the caller (controller) can pass
  // this straight into toPublicUser() without a second DB round-trip.
  // (Cast needed for the same reason as in auth.service.ts — Mongoose's
  // types don't automatically reflect what populate() does at runtime.)
  return (await user.populate('role')) as unknown as AuthedUser
}

// Returns every user account, newest first, with roles populated.
// Used by the admin "manage users" screen.
export async function listUsers() {
  const users = await User.find().populate('role').sort({ createdAt: -1 })
  return users as unknown as AuthedUser[]
}
