import { test as setup, expect } from '@playwright/test'
import { authStatePath } from './fixtures/paths'

// Logs in as each seeded test role once (see server/src/utils/seed.ts's
// TEST_ACCOUNTS, credentials also documented in TEST_LOGINS.md) through the
// real /login page, and saves the resulting browser storage state — the
// httpOnly refresh-token cookie — to e2e/.auth/<role>.json. Every other spec
// then reuses one of these via `test.use({ storageState: ... })` instead of
// re-logging in. This works even though the access token itself lives only
// in an in-memory JS variable (client/src/lib/api.ts, never localStorage):
// storageState captures cookies at the browser level regardless of what JS
// on the page can see, and AuthContext.tsx's silent-refresh-on-load turns
// that cookie back into a working access token the next time the page loads.
const ACCOUNTS = {
  admin: { email: 'amaadmin@sana.test', password: 'Password123!' },
  doctorA: { email: 'kwamedoc@sana.test', password: 'Password123!' },
  doctorB: { email: 'nanadoc@sana.test', password: 'Password123!' },
  nurse: { email: 'akosuanurse@sana.test', password: 'Password123!' },
  patient: { email: 'kofipatient@sana.test', password: 'Password123!' },
  labtech: { email: 'yawlabtech@sana.test', password: 'Password123!' },
  pharmacist: { email: 'efuapharm@sana.test', password: 'Password123!' },
} as const

for (const [role, { email, password }] of Object.entries(ACCOUNTS)) {
  setup(`authenticate as ${role}`, async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Sign in' }).click()

    await page.waitForURL('**/dashboard')
    await expect(page.getByRole('button', { name: /log out/i })).toBeVisible()

    await page.context().storageState({ path: authStatePath(role) })
  })
}
