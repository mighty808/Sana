import { test, expect } from '@playwright/test'
import { getRolePermissions, type RoleKey } from './fixtures/api'
import { authStatePath } from './fixtures/paths'
import { OPEN_ROUTES, PERMISSIONED_ROUTES } from './fixtures/routes'

// The access matrix: every role against every permissioned route.
//
// What makes this worth having is that the expected answer isn't written down
// here — it's read from each role's own login response at runtime. Grant or
// revoke a permission in the server's permissions.ts and this spec's
// expectations move with it, so it keeps testing the real rule rather than a
// copy of it that quietly goes stale.
//
// ProtectedRoute's two behaviours are what's actually asserted (see
// client/src/components/ProtectedRoute.tsx): not logged in → /login; logged in
// but missing the permission → /dashboard.

const ROLES: RoleKey[] = ['admin', 'doctorA', 'nurse', 'patient', 'labtech', 'pharmacist']

// Routes are plain literals like "/ward-board" — nothing that needs escaping.
const endsWith = (path: string) => new RegExp(`${path}$`)

// ProtectedRoute renders `null` while AuthContext is still resolving the
// session (`isBooting`) — during that window it neither shows the page nor
// redirects, so the URL is still the one that was requested even when it's
// about to bounce. Asserting straight after goto() races that window, which
// is what made this spec fail roughly one run in two on a loaded machine.
//
// Waiting for the app shell to mount is the real "routing has settled"
// signal: it only appears once isBooting is false and ProtectedRoute has
// decided to render rather than redirect. Both outcomes under test — the
// allowed page and the /dashboard bounce — sit inside the shell, so this is
// the right wait for either. `goto()` tears the DOM down first, so this can't
// match a leftover shell from the previous iteration of the loop.
// The generous timeout is the point, not a band-aid: this waits on a boot
// that includes a network round-trip (the silent token refresh), which is a
// different order of magnitude from the DOM updates Playwright's 5s default
// is sized for. Once the shell is up, the URL assertions that follow are
// instant, so this costs nothing on a healthy run.
const BOOT_TIMEOUT = 25_000

async function waitForRoutingToSettle(page: import('@playwright/test').Page) {
  await expect(page.locator('[data-slot="sidebar-menu-button"]').first()).toBeVisible({ timeout: BOOT_TIMEOUT })
}

// The logged-out equivalent: the redirect to /login has landed once the sign-in
// form is actually on screen.
async function waitForLoginToRender(page: import('@playwright/test').Page) {
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible({ timeout: BOOT_TIMEOUT })
}

for (const role of ROLES) {
  test(`${role}: every route matches that role's real permissions`, async ({ browser, request }) => {
    const permissions = await getRolePermissions(request, role)
    const context = await browser.newContext({ storageState: authStatePath(role) })
    const page = await context.newPage()

    try {
      for (const { path, permission } of PERMISSIONED_ROUTES) {
        await page.goto(path)
        await waitForRoutingToSettle(page)

        if (permissions.includes(permission)) {
          await expect(page, `${role} holds ${permission}, so ${path} should open`).toHaveURL(endsWith(path))
        } else {
          await expect(page, `${role} lacks ${permission}, so ${path} should bounce to /dashboard`).toHaveURL(
            endsWith('/dashboard'),
          )
        }
      }

      // Everyone logged in can reach these, whatever their role.
      for (const path of OPEN_ROUTES) {
        await page.goto(path)
        await waitForRoutingToSettle(page)
        await expect(page, `${path} is open to every logged-in role`).toHaveURL(endsWith(path))
      }
    } finally {
      await context.close()
    }
  })
}

test('a logged-out visitor is sent to /login from every protected route', async ({ browser }) => {
  // No storageState — a genuinely anonymous browser.
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    for (const { path } of PERMISSIONED_ROUTES) {
      await page.goto(path)
      await waitForLoginToRender(page)
      await expect(page, `${path} should require login`).toHaveURL(/\/login$/)
    }
    for (const path of OPEN_ROUTES) {
      await page.goto(path)
      await waitForLoginToRender(page)
      await expect(page, `${path} should require login`).toHaveURL(/\/login$/)
    }
  } finally {
    await context.close()
  }
})
