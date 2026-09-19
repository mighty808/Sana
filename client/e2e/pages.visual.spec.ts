import { test, expect } from '@playwright/test'
import type { RoleKey } from './fixtures/api'
import { authStatePath } from './fixtures/paths'

// Screenshot comparisons, isolated in their own `visual` project so a cosmetic
// diff can never fail a functional run (`npm run test:e2e` skips this file).
//
// Two things make this survivable rather than the usual abandoned-after-a-week
// visual suite:
//   - Baselines are stored per-platform (see snapshotPathTemplate in
//     playwright.config.ts), so Windows and CI's Linux don't overwrite each
//     other's images.
//   - Everything genuinely dynamic is masked below. Without that, these would
//     fail on every run for reasons nobody cares about — the clock moved, a
//     parallel spec added a patient, a badge counted one higher.
//
// Update baselines deliberately with:
//   npm run test:e2e:visual -- --update-snapshots

const PAGES: Array<{ name: string; role: RoleKey | null; url: string }> = [
  { name: 'landing', role: null, url: '/' },
  { name: 'login', role: null, url: '/login' },
  { name: 'admin-dashboard', role: 'admin', url: '/dashboard' },
  { name: 'patients', role: 'admin', url: '/patients' },
  { name: 'encounters', role: 'doctorA', url: '/encounters' },
  { name: 'prescriptions', role: 'pharmacist', url: '/prescriptions' },
  { name: 'profile', role: 'doctorA', url: '/profile' },
]

for (const { name, role, url } of PAGES) {
  test(`${name} looks right`, async ({ browser }) => {
    const context = await browser.newContext(role ? { storageState: authStatePath(role) } : {})
    const page = await context.newPage()

    try {
      // networkidle, not the default 'load': the landing page's hero photo
      // and the pages' data fetches finish after load, and screenshotting
      // mid-flight produced a diff on every run.
      await page.goto(url, { waitUntil: 'networkidle' })

      // Anything whose content legitimately changes between runs: the date
      // header and greeting, relative timestamps, unread badges, stat values,
      // and every table body (rows accumulate as other specs create data).
      // Images are masked too — decode timing varies just enough to trip the
      // pixel threshold without anything actually having changed.
      await expect(page).toHaveScreenshot(`${name}.png`, {
        fullPage: true,
        mask: [
          page.locator('tbody'),
          page.locator('img'),
          page.locator('[data-slot="sidebar-menu-button"] span:last-child'),
          page.getByRole('heading', { level: 1 }),
          page.locator('[data-slot="card"]'),
        ],
      })
    } finally {
      await context.close()
    }
  })
}
