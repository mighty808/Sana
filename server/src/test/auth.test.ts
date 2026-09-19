import jwt from 'jsonwebtoken'
import {
  login,
  rotateRefreshToken,
  logout,
  requestPasswordReset,
  resetPassword,
  signRefreshToken,
  hashPassword,
} from '../services/auth.service.js'
import { User } from '../models/User.js'
import { env } from '../config/env.js'
import { AppError } from '../utils/apiResponse.js'
import { connectTestDb, clearTestDb, disconnectTestDb, DB_BOOT_TIMEOUT_MS } from './setupTestDb.js'
import { createUser } from './factories.js'

beforeAll(connectTestDb, DB_BOOT_TIMEOUT_MS)
afterEach(clearTestDb)
afterAll(disconnectTestDb, DB_BOOT_TIMEOUT_MS)

const REAL_PASSWORD = 'correct horse battery staple'

describe('login', () => {
  test('succeeds with the right email and password, returns a token pair', async () => {
    const user = await createUser('DOCTOR', { password: REAL_PASSWORD })

    const result = await login(user.email, REAL_PASSWORD)

    expect(result.user.id).toBe(user.id)
    expect(typeof result.accessToken).toBe('string')
    expect(typeof result.refreshToken).toBe('string')
  })

  test('records lastLoginAt on success', async () => {
    const user = await createUser('DOCTOR', { password: REAL_PASSWORD })
    expect(user.lastLoginAt).toBeUndefined()

    await login(user.email, REAL_PASSWORD)

    const reread = await User.findById(user.id)
    expect(reread?.lastLoginAt).toBeInstanceOf(Date)
  })

  test('rejects the wrong password', async () => {
    const user = await createUser('DOCTOR', { password: REAL_PASSWORD })
    await expect(login(user.email, 'wrong password')).rejects.toMatchObject({
      status: 401,
      code: 'INVALID_CREDENTIALS',
    } satisfies Partial<AppError>)
  })

  test('rejects an email that does not exist, with the SAME error as a wrong password', async () => {
    // Same message/code as the wrong-password case above is the point —
    // it must not be possible to tell "no such account" apart from "wrong
    // password" from the response alone.
    await expect(login('nobody@test.sana', REAL_PASSWORD)).rejects.toMatchObject({
      status: 401,
      code: 'INVALID_CREDENTIALS',
    })
  })

  test('rejects an INACTIVE account even with the correct password', async () => {
    const user = await createUser('DOCTOR', { password: REAL_PASSWORD, status: 'INACTIVE' })
    await expect(login(user.email, REAL_PASSWORD)).rejects.toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' })
  })
})

describe('rotateRefreshToken', () => {
  test('issues a fresh token pair for a valid, current refresh token', async () => {
    const user = await createUser('DOCTOR')
    const token = signRefreshToken(user.id, user.tokenVersion)

    const result = await rotateRefreshToken(token)

    expect(result.user.id).toBe(user.id)
    expect(typeof result.accessToken).toBe('string')
  })

  test('rejects a token signed with the wrong secret', async () => {
    const user = await createUser('DOCTOR')
    const badToken = jwt.sign({ id: user.id, tokenVersion: user.tokenVersion }, 'wrong-secret')

    await expect(rotateRefreshToken(badToken)).rejects.toMatchObject({ status: 401, code: 'INVALID_REFRESH_TOKEN' })
  })

  test('rejects a token whose tokenVersion no longer matches (revoked by logout)', async () => {
    const user = await createUser('DOCTOR')
    const token = signRefreshToken(user.id, user.tokenVersion) // tokenVersion 0

    await logout(user.id) // bumps tokenVersion to 1

    await expect(rotateRefreshToken(token)).rejects.toMatchObject({ status: 401, code: 'INVALID_REFRESH_TOKEN' })
  })

  test('rejects a token for a user that no longer exists', async () => {
    const user = await createUser('DOCTOR')
    const token = signRefreshToken(user.id, user.tokenVersion)
    await User.deleteOne({ _id: user.id })

    await expect(rotateRefreshToken(token)).rejects.toMatchObject({ status: 401, code: 'INVALID_REFRESH_TOKEN' })
  })

  test('an expired token is rejected', async () => {
    const user = await createUser('DOCTOR')
    const expired = jwt.sign({ id: user.id, tokenVersion: user.tokenVersion }, env.jwtRefreshSecret, {
      expiresIn: -1, // already expired the instant it's signed
    })

    await expect(rotateRefreshToken(expired)).rejects.toMatchObject({ status: 401, code: 'INVALID_REFRESH_TOKEN' })
  })
})

describe('logout', () => {
  test('bumps tokenVersion, invalidating every previously-issued refresh token', async () => {
    const user = await createUser('DOCTOR')
    const before = user.tokenVersion

    await logout(user.id)

    const reread = await User.findById(user.id)
    expect(reread?.tokenVersion).toBe(before + 1)
  })
})

describe('requestPasswordReset / resetPassword', () => {
  test('a valid, unexpired token successfully resets the password and logs out everywhere', async () => {
    const user = await createUser('DOCTOR', { password: REAL_PASSWORD })
    const rawToken = await requestPasswordReset(user.email)
    expect(typeof rawToken).toBe('string')

    const updated = await resetPassword(rawToken as string, 'a brand new password')

    // The new password actually works.
    const loginResult = await login(user.email, 'a brand new password')
    expect(loginResult.user.id).toBe(user.id)
    // The old password no longer works.
    await expect(login(user.email, REAL_PASSWORD)).rejects.toMatchObject({ status: 401 })
    // Every existing session was invalidated (tokenVersion bumped).
    expect(updated.tokenVersion).toBe((user.tokenVersion ?? 0) + 1)
  })

  test('requesting a reset for an email that does not exist returns null, not an error', async () => {
    // The controller relies on this to send the same generic message either
    // way — throwing here would leak which emails are registered.
    await expect(requestPasswordReset('nobody@test.sana')).resolves.toBeNull()
  })

  test('a token is single-use — resetting a second time with the same raw token fails', async () => {
    const user = await createUser('DOCTOR', { password: REAL_PASSWORD })
    const rawToken = (await requestPasswordReset(user.email)) as string
    await resetPassword(rawToken, 'first new password')

    await expect(resetPassword(rawToken, 'second new password')).rejects.toMatchObject({
      status: 400,
      code: 'INVALID_RESET_TOKEN',
    })
  })

  test('an expired reset token is rejected', async () => {
    const user = await createUser('DOCTOR', { password: REAL_PASSWORD })
    const rawToken = (await requestPasswordReset(user.email)) as string
    // Force the stored expiry into the past, simulating more than an hour
    // having passed since the request.
    await User.updateOne({ _id: user.id }, { passwordResetExpires: new Date(Date.now() - 1000) })

    await expect(resetPassword(rawToken, 'new password')).rejects.toMatchObject({
      status: 400,
      code: 'INVALID_RESET_TOKEN',
    })
  })

  test('a made-up token is rejected', async () => {
    await expect(resetPassword('not-a-real-token', 'new password')).rejects.toMatchObject({
      status: 400,
      code: 'INVALID_RESET_TOKEN',
    })
  })
})

describe('hashPassword / login round trip', () => {
  test('a password hashed by hashPassword() is exactly what login() can verify', async () => {
    const hash = await hashPassword(REAL_PASSWORD)
    const user = await createUser('DOCTOR')
    await User.updateOne({ _id: user.id }, { passwordHash: hash })

    await expect(login(user.email, REAL_PASSWORD)).resolves.toMatchObject({ user: { id: user.id } })
  })
})
