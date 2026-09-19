import { test, expect } from './fixtures/test'
import { createThrowawayUser } from './fixtures/api'

// These specs deliberately start logged out — they're testing the login and
// logout flow itself, so they use the plain `page` fixture rather than one of
// the pre-authenticated role pages.
//
// Every test here signs in as a throwaway account created for that test, never
// one of the seven shared seeded logins. Logging out bumps the account's
// tokenVersion, which invalidates every saved storageState for that user — so
// logging out of, say, amaadmin here would break every other admin-based spec
// in the run. That actually happened: it took out ~10 unrelated tests before
// the cause was obvious.
test.describe('login', () => {
  test('a correct email/password lands on the dashboard', async ({ page, request }) => {
    const user = await createThrowawayUser(request)

    await page.goto('/login')
    await page.getByLabel('Email').fill(user.email)
    await page.getByLabel('Password', { exact: true }).fill(user.password)
    await page.getByRole('button', { name: 'Sign in' }).click()

    await page.waitForURL('**/dashboard')
    await expect(page.getByRole('button', { name: /log out/i })).toBeVisible()
  })

  test('a wrong password shows an error and stays on /login', async ({ page, request }) => {
    const user = await createThrowawayUser(request)

    await page.goto('/login')
    await page.getByLabel('Email').fill(user.email)
    await page.getByLabel('Password', { exact: true }).fill('definitely-the-wrong-password')
    await page.getByRole('button', { name: 'Sign in' }).click()

    // Matches auth.service.ts's login() — the same message whether the email
    // doesn't exist or the password is wrong, so a wrong guess can't be used
    // to enumerate real accounts.
    await expect(page.getByText('Invalid email or password')).toBeVisible()
    await expect(page).toHaveURL(/\/login$/)
  })
})

test('logout returns to /login', async ({ page, request }) => {
  const user = await createThrowawayUser(request)

  await page.goto('/login')
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Password', { exact: true }).fill(user.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL('**/dashboard')

  await page.getByRole('button', { name: /log out/i }).click()

  await page.waitForURL('**/login')
})
