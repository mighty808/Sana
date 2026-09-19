import { test, expect } from '@playwright/test'
import type { RoleKey } from './fixtures/api'
import { authStatePath } from './fixtures/paths'

// analytics.service.ts's getDashboard returns a different shape per role, and
// DashboardPage renders a different set of stat cards for each. This checks
// every role gets *its own* dashboard — not just that the page loaded — by
// asserting on stat labels that only that role's branch renders.
const EXPECTED: Record<string, { firstName: string; stats: string[] }> = {
  admin: {
    firstName: 'Ama',
    stats: ['Total patients', 'Staff accounts', 'Appointments today', 'Pending lab orders', 'Outstanding balance'],
  },
  doctorA: {
    firstName: 'Kwame',
    stats: ['My patients', 'Active encounters', 'Lab orders to review', 'AI consults to review'],
  },
  nurse: {
    firstName: 'Akosua',
    stats: ['Patients registered today', 'Checked in today', 'Vitals pending'],
  },
  patient: {
    firstName: 'Kofi',
    stats: ['Upcoming appointments', 'Unread notifications', 'Outstanding balance'],
  },
  labtech: {
    firstName: 'Yaw',
    stats: ['Pending orders', 'In progress', 'Completed today', 'Released today'],
  },
  pharmacist: {
    firstName: 'Efua',
    stats: ['Pending prescriptions', 'Dispensed today'],
  },
}

for (const [role, { firstName, stats }] of Object.entries(EXPECTED)) {
  test(`${role}: dashboard renders that role's own stats`, async ({ browser }) => {
    const context = await browser.newContext({ storageState: authStatePath(role as RoleKey) })
    const page = await context.newPage()

    try {
      await page.goto('/dashboard')

      // The greeting is "<time of day>, <first name>" — confirms the session
      // resolved to the right person before checking what they can see.
      // Matched by name rather than by level: the AppShell header also renders
      // an <h1> ("Dashboard"), so `{ level: 1 }` alone is ambiguous.
      await expect(page.getByRole('heading', { name: new RegExp(`, ${firstName}$`) })).toBeVisible()

      for (const stat of stats) {
        await expect(page.getByText(stat, { exact: true }), `${role} should see "${stat}"`).toBeVisible()
      }
    } finally {
      await context.close()
    }
  })
}
