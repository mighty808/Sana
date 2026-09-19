import { z } from 'zod'
import { ROLE_NAMES } from '../types/permissions.js'

// Validates POST /auth/login request bodies.
// The email is trimmed and lowercased so that "  Foo@Bar.com " and
// "foo@bar.com" are treated as the same address, matching how emails are
// stored (also lowercased). The password just needs to be present here —
// whether it's actually correct is checked against the stored hash in the
// service layer, not in this schema.
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
})

// Validates POST /auth/forgot-password request bodies.
export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
})

// Validates POST /auth/reset-password request bodies.
// `token` is the raw reset token that was emailed (or logged) to the user.
// `newPassword` must be at least 8 characters, a basic minimum strength
// requirement.
export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8),
})

// Validates POST /users request bodies (admin creating a new user account).
// `role` only accepts the known role names, so an invalid or made-up role
// can't be assigned.
export const createUserSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional(),
  role: z.enum(ROLE_NAMES),
})
