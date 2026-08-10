import crypto from 'node:crypto'
import argon2 from 'argon2'
import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import { User } from '../models/User.js'
import { AppError } from '../utils/apiResponse.js'
import type { AuthedUser } from '../types/user.js'

// Creates a short-lived JWT access token containing just the user's id.
// Sent to the client as a normal JSON field (not a cookie) and attached by
// the frontend as "Authorization: Bearer <token>" on every API request.
export function signAccessToken(userId: string) {
  return jwt.sign({ id: userId }, env.jwtAccessSecret, { expiresIn: env.jwtAccessExpiresIn } as jwt.SignOptions)
}

// Creates a long-lived JWT refresh token containing the user's id AND their
// current tokenVersion. Embedding tokenVersion lets us invalidate every
// outstanding refresh token for a user in one step (see logout() below) —
// when the token's tokenVersion no longer matches the user's stored value,
// rotateRefreshToken() rejects it even though the JWT signature is still valid.
export function signRefreshToken(userId: string, tokenVersion: number) {
  return jwt.sign({ id: userId, tokenVersion }, env.jwtRefreshSecret, {
    expiresIn: env.jwtRefreshExpiresIn,
  } as jwt.SignOptions)
}

// Hashes a plaintext password with Argon2id (the OWASP-recommended variant —
// resistant to both GPU cracking and side-channel attacks). Never store or
// log the plaintext password anywhere.
export async function hashPassword(password: string) {
  return argon2.hash(password, { type: argon2.argon2id })
}

// Checks a plaintext password against a stored Argon2 hash. Returns true/false,
// never throws for a simple mismatch.
export async function verifyPassword(hash: string, password: string) {
  return argon2.verify(hash, password)
}

// Core login logic: looks up the user by email, verifies their password,
// updates lastLoginAt, and issues a fresh access + refresh token pair.
// Throws AppError (caught by the global error handler) for any failure —
// deliberately using the SAME error message/code for "no such user" and
// "wrong password" so an attacker can't use the error to enumerate valid emails.
export async function login(email: string, password: string) {
  // `.populate('role')` replaces the raw role ObjectId with the full Role
  // document at RUNTIME, but Mongoose's TypeScript types can't express that
  // automatically — hence the `as unknown as AuthedUser` cast below, which
  // just tells TypeScript to trust that the populate() call actually happened.
  const user = (await User.findOne({ email }).populate('role')) as unknown as AuthedUser | null
  if (!user || user.status !== 'ACTIVE') {
    throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS')
  }

  const valid = await verifyPassword(user.passwordHash, password)
  if (!valid) {
    throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS')
  }

  // Record when this successful login happened, for admin visibility.
  user.lastLoginAt = new Date()
  await user.save()

  const accessToken = signAccessToken(user.id)
  const refreshToken = signRefreshToken(user.id, user.tokenVersion)

  return { user, accessToken, refreshToken }
}

// Exchanges a valid refresh token (read from the HTTP-only cookie by the
// controller) for a brand-new access + refresh token pair. This is what lets
// a user stay logged in beyond the 15-minute access token lifetime without
// re-entering their password, as long as they keep using the app within the
// refresh token's 7-day window.
export async function rotateRefreshToken(token: string) {
  let decoded: { id: string; tokenVersion: number }
  try {
    decoded = jwt.verify(token, env.jwtRefreshSecret) as { id: string; tokenVersion: number }
  } catch {
    // Signature invalid, or the token has expired.
    throw new AppError('Invalid or expired refresh token', 401, 'INVALID_REFRESH_TOKEN')
  }

  // Populate role here too (this was previously missing — the refresh
  // response would otherwise have sent back a bare role ObjectId instead of
  // the role's name/permissions, breaking anything reading user.role.name).
  const user = (await User.findById(decoded.id).populate('role')) as unknown as AuthedUser | null
  // Reject if: user no longer exists, account was deactivated, OR the
  // tokenVersion embedded in this token doesn't match the user's current
  // value (meaning they logged out or reset their password since this
  // refresh token was issued — it's been explicitly revoked).
  if (!user || user.status !== 'ACTIVE' || user.tokenVersion !== decoded.tokenVersion) {
    throw new AppError('Invalid or expired refresh token', 401, 'INVALID_REFRESH_TOKEN')
  }

  // Issue a fresh pair (refresh token rotation) rather than reusing the old
  // refresh token — reduces the window in which a stolen refresh token is useful.
  const accessToken = signAccessToken(user.id)
  const refreshToken = signRefreshToken(user.id, user.tokenVersion)
  return { user, accessToken, refreshToken }
}

// Logs a user out server-side by bumping their tokenVersion. Since every
// refresh token embeds the tokenVersion that was current when it was issued,
// this single increment instantly invalidates ALL refresh tokens for this
// user (e.g. if they were logged in on multiple devices) — they'll all fail
// the check in rotateRefreshToken() above from now on.
export async function logout(userId: string) {
  await User.findByIdAndUpdate(userId, { $inc: { tokenVersion: 1 } })
}

// Step 1 of the forgot-password flow: generates a random reset token, stores
// only its SHA-256 hash (so a database leak alone can't be used to reset
// passwords), and sets a 1-hour expiry. Returns the RAW token (not the hash)
// so the caller can email/display it to the user — this is the only time the
// raw token exists outside the user's own inbox.
export async function requestPasswordReset(email: string) {
  const user = await User.findOne({ email })
  // Deliberately return null (not throw) when no account matches — the
  // controller sends the same generic success message either way, so an
  // attacker can't use this endpoint to check which emails are registered.
  if (!user) return null

  const rawToken = crypto.randomBytes(32).toString('hex')
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')

  user.passwordResetTokenHash = tokenHash
  user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000) // valid for 1 hour
  await user.save()

  // Email delivery is explicitly out of MVP scope (see blueprint "What Gets CUT"),
  // so the raw token is just returned to the caller, which logs it — good enough
  // to demo the full reset flow end-to-end without a real mail server.
  return rawToken
}

// Step 2 of the forgot-password flow: takes the raw token the user received,
// re-hashes it the same way, and looks for a user whose stored hash matches
// AND whose reset window hasn't expired. If found, sets the new password and
// invalidates the reset token (single-use) plus all existing sessions.
export async function resetPassword(rawToken: string, newPassword: string) {
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
  const user = await User.findOne({
    passwordResetTokenHash: tokenHash,
    passwordResetExpires: { $gt: new Date() }, // must not have expired yet
  }).select('+passwordResetTokenHash +passwordResetExpires') // these fields are select:false by default

  if (!user) {
    throw new AppError('Invalid or expired reset token', 400, 'INVALID_RESET_TOKEN')
  }

  user.passwordHash = await hashPassword(newPassword)
  // Clear the reset token so it can't be reused (single-use tokens).
  user.passwordResetTokenHash = undefined
  user.passwordResetExpires = undefined
  // Log the user out everywhere — anyone with an old refresh token (e.g. on
  // a device the account owner no longer controls) is forced to log in again.
  user.tokenVersion += 1
  await user.save()

  return user
}

// Strips sensitive/internal fields (passwordHash, tokenVersion, reset token
// data) off a user document before sending it to the client. Every API
// response that includes user data should go through this function instead
// of returning the raw Mongoose document.
export function toPublicUser(user: AuthedUser) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    role: user.role,
    status: user.status,
    lastLoginAt: user.lastLoginAt,
  }
}
