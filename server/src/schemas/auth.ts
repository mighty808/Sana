import { z } from 'zod'
import { ROLE_NAMES } from '../types/permissions.js'

// Validates POST /auth/login request bodies.
// Trims/lowercases the email so "  Foo@Bar.com " and "foo@bar.com" match the
// same stored (also-lowercased) email; password just needs to be present —
// its correctness is checked against the hash in the service layer, not here.
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
})

// Validates POST /auth/forgot-password request bodies.
export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
})

// Validates POST /auth/reset-password request bodies.
// `token` is the raw reset token emailed/logged to the user; `newPassword`
// must be at least 8 characters (a basic strength floor for the MVP).
export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8),
})

// Validates POST /users request bodies (admin creating a new user account).
// `role` is restricted to the 4 known role names so an invalid role can't be assigned.
export const createUserSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional(),
  role: z.enum(ROLE_NAMES),
})
