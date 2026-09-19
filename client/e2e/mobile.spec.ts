import { test, expect } from './fixtures/test'

// Runs in the `mobile` project only (a Pixel 7 viewport) — playwright.config.ts
// greps for the @mobile tag. Deliberately a small subset: the app's logic
// doesn't change with viewport, only its layout does, so re-running the whole
// suite at phone size would double the runtime for very little extra signal.

test('@mobile a doctor can sign in and reach their dashboard on a phone', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill('kwamedoc@sana.test')
  await page.getByLabel('Password', { exact: true }).fill('Password123!')
  await page.getByRole('button', { name: 'Sign in' }).click()

  await page.waitForURL('**/dashboard')
  await expect(page.getByRole('heading', { name: /, Kwame$/ })).toBeVisible()
})

test('@mobile the sidebar is collapsed behind a toggle at phone width', async ({ nursePage }) => {
  await nursePage.goto('/dashboard')

  // At this width the nav isn't on screen — it opens from the toggle instead
  // of sitting alongside the content the way it does on desktop.
  const patientsLink = nursePage.getByRole('link', { name: 'Patients' })
  await expect(patientsLink).toBeHidden()

  await nursePage.getByRole('button', { name: 'Toggle Sidebar' }).click()
  await expect(patientsLink).toBeVisible()

  await patientsLink.click()
  await expect(nursePage).toHaveURL(/\/patients$/)
})

test('@mobile the patients list is usable at phone width', async ({ nursePage }) => {
  await nursePage.goto('/patients')

  await nursePage.getByPlaceholder('Search by name, patient number, or phone').fill('Boateng')
  await expect(nursePage.getByRole('link', { name: /Ama Boateng/ })).toBeVisible()
})
