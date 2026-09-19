import { test, expect } from './fixtures/test'

// The four routes that sit outside <ProtectedRoute> entirely, plus the
// catch-all. `page` here is the plain unauthenticated fixture — these are the
// only specs that deliberately run logged out.
test.describe('public pages', () => {
  test('the landing page sends a logged-out visitor to sign in', async ({ page }) => {
    await page.goto('/')

    const signIn = page.getByRole('link', { name: /Sign in/ }).first()
    await expect(signIn).toBeVisible()
    await signIn.click()
    await expect(page).toHaveURL(/\/login$/)
  })

  test('the landing page sends an already-signed-in visitor to their dashboard', async ({ adminPage }) => {
    // Same button, different destination — LandingPage swaps both the label
    // and the href once a session exists.
    await adminPage.goto('/')
    await adminPage.getByRole('link', { name: /Go to dashboard/ }).first().click()
    await expect(adminPage).toHaveURL(/\/dashboard$/)
  })

  test('forgot password confirms without revealing whether the email exists', async ({ page }) => {
    await page.goto('/forgot-password')
    await page.getByLabel('Email').fill('amaadmin@sana.test')
    await page.getByRole('button', { name: 'Send reset link' }).click()

    // The page always shows this, registered address or not, so it can't be
    // used to enumerate accounts (see auth.service.ts's requestPasswordReset).
    await expect(page.getByText('Check your email')).toBeVisible()
  })

  test('reset password without a token shows the invalid-link state', async ({ page }) => {
    await page.goto('/reset-password')
    await expect(page.getByText('Link expired or invalid')).toBeVisible()
  })

  test('reset password with a token shows the new-password form', async ({ page }) => {
    // The token isn't verified until submit, so any value gets the form —
    // this asserts the routing/branching, not the token itself.
    await page.goto('/reset-password?token=e2e-placeholder-token')
    await expect(page.getByText('Choose a new password')).toBeVisible()
  })

  test('an unknown route falls back to the landing page', async ({ page }) => {
    await page.goto('/no-such-page')
    await expect(page).toHaveURL(/\/$/)
  })
})
