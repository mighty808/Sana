import AxeBuilder from '@axe-core/playwright'
import { test, expect } from '@playwright/test'
import type { RoleKey } from './fixtures/api'
import { authStatePath } from './fixtures/paths'

// Automated accessibility scanning, motivated by a real defect this suite
// already caught by hand: the Email field's <label> wasn't associated with its
// input on Login and Forgot Password, so screen readers announced the
// placeholder instead of the label.
//
// Only serious/critical violations fail. Starting stricter would flag dozens
// of minor issues on day one, and a suite that's red by default gets ignored
// rather than fixed — the floor can be raised once these stay clean.
const IMPACTS_THAT_FAIL = new Set(['serious', 'critical'])

// Nothing is excluded — color-contrast included. It was temporarily opted out
// while the muted-text palette failed WCAG AA (slate-400/500 measured as low
// as 2.47:1 on the off-white card surfaces); that's since been fixed by
// darkening --muted-foreground and moving muted text to slate-600, so the
// rule is enforced again and a regression will fail here.
async function scan(page: import('@playwright/test').Page, url: string) {
  await page.goto(url)
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa'])
    .analyze()

  const blocking = results.violations.filter((v) => IMPACTS_THAT_FAIL.has(v.impact ?? ''))
  // The message lists rule ids, the offending selectors, and axe's own
  // explanation (which for contrast includes the measured ratio and the two
  // colours), so a failure says what to fix rather than just "a11y failed".
  const detail = blocking
    .map(
      (v) =>
        `${v.id} (${v.impact}):\n` +
        v.nodes.map((n) => `    ${n.target.join(' ')}\n      ${n.failureSummary?.replace(/\n/g, ' ')}`).join('\n'),
    )
    .join('\n')

  expect(blocking, `Accessibility violations on ${url}:\n${detail}`).toEqual([])
}

test.describe('accessibility', () => {
  // Public pages, scanned logged out.
  for (const url of ['/', '/login', '/forgot-password']) {
    test(`${url} has no serious accessibility violations`, async ({ page }) => {
      await scan(page, url)
    })
  }

  // Signed-in pages, each scanned as a role that can actually reach it.
  const SIGNED_IN: Array<{ role: RoleKey; url: string }> = [
    { role: 'admin', url: '/dashboard' },
    { role: 'admin', url: '/patients' },
    { role: 'admin', url: '/users' },
    { role: 'admin', url: '/invoices' },
    { role: 'doctorA', url: '/encounters' },
    { role: 'doctorA', url: '/referrals' },
    { role: 'nurse', url: '/appointments' },
    { role: 'labtech', url: '/lab-orders' },
    { role: 'pharmacist', url: '/prescriptions' },
    { role: 'patient', url: '/notifications' },
  ]

  for (const { role, url } of SIGNED_IN) {
    test(`${url} (as ${role}) has no serious accessibility violations`, async ({ browser }) => {
      const context = await browser.newContext({ storageState: authStatePath(role) })
      const page = await context.newPage()
      try {
        await scan(page, url)
      } finally {
        await context.close()
      }
    })
  }
})
