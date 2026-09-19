import { test, expect } from '@playwright/test'
import type { RoleKey } from './fixtures/api'
import { authStatePath } from './fixtures/paths'

// What each role should actually see in the sidebar. Compared by href rather
// than by label, because the visible text picks up badge counts ("Notifications1")
// and because two roles use different labels for the same route ("Patients" vs
// "My Patients") — the route is the stable identity.
//
// These lists are deliberately written out rather than derived from
// navItems.ts: the point of this spec is to catch an *unintended* change to
// what a role can see, and a test that recomputes its expectation from the
// same source it's checking would happily agree with a mistake.
const EXPECTED_NAV: Record<RoleKey, string[]> = {
  admin: [
    '/dashboard',
    '/analytics',
    '/notifications',
    '/patients',
    '/appointments',
    '/encounters',
    '/ward-board',
    '/lab-orders',
    '/prescriptions',
    '/users',
    '/invoices',
    '/audit-logs',
  ],
  doctorA: [
    '/dashboard',
    '/notifications',
    '/appointments',
    '/patients',
    '/encounters',
    '/ward-board',
    '/referrals',
    '/lab-orders',
    '/prescriptions',
  ],
  doctorB: [
    '/dashboard',
    '/notifications',
    '/appointments',
    '/patients',
    '/encounters',
    '/ward-board',
    '/referrals',
    '/lab-orders',
    '/prescriptions',
  ],
  nurse: ['/dashboard', '/notifications', '/patients', '/appointments', '/encounters', '/ward-board'],
  patient: ['/dashboard', '/notifications', '/appointments', '/lab-results', '/invoices', '/prescriptions'],
  labtech: ['/dashboard', '/notifications', '/lab-orders'],
  pharmacist: ['/dashboard', '/notifications', '/prescriptions'],
}

// doctorB is the same role as doctorA — no need to check the identical nav twice.
const ROLES: RoleKey[] = ['admin', 'doctorA', 'nurse', 'patient', 'labtech', 'pharmacist']

for (const role of ROLES) {
  test(`${role}: sidebar shows exactly the right links, and each one navigates`, async ({ browser }) => {
    const context = await browser.newContext({ storageState: authStatePath(role) })
    const page = await context.newPage()

    try {
      await page.goto('/dashboard')

      const navLinks = page.locator('[data-slot="sidebar-menu-button"]')
      await expect(navLinks.first()).toBeVisible()

      const hrefs = await navLinks.evaluateAll((els) => els.map((el) => el.getAttribute('href') ?? ''))
      expect(hrefs.sort()).toEqual([...EXPECTED_NAV[role]].sort())

      // Every link actually goes where it says. This is client-side routing,
      // so it's a cheap check — and it catches a nav entry pointing at a route
      // the role would then be bounced out of.
      for (const href of EXPECTED_NAV[role]) {
        await page.locator(`[data-slot="sidebar-menu-button"][href="${href}"]`).click()
        await expect(page, `${role} clicking ${href}`).toHaveURL(new RegExp(`${href}$`))
      }
    } finally {
      await context.close()
    }
  })
}
