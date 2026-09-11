import { test as base, type Browser, type Page } from '@playwright/test'
import { authStatePath } from './paths'

// One ready-to-use, already-logged-in page per seeded role. Specs declare the
// roles they need and get pages back:
//
//   test('...', async ({ nursePage, doctorPage }) => { ... })
//
// This replaces the hand-rolled `browser.newContext({ storageState })` dance
// each spec would otherwise repeat, and guarantees the context is closed even
// when a test fails partway through (a leaked context keeps a browser alive
// and slows every later test in the same worker).
//
// The logins themselves come from auth.setup.ts, which runs first via the
// `setup` project dependency in playwright.config.ts.
export type RoleName = 'admin' | 'doctorA' | 'doctorB' | 'nurse' | 'patient' | 'labtech' | 'pharmacist'

interface RolePages {
  adminPage: Page
  doctorPage: Page
  doctorBPage: Page
  nursePage: Page
  patientPage: Page
  labtechPage: Page
  pharmacistPage: Page
}

async function withRolePage(browser: Browser, role: RoleName, use: (page: Page) => Promise<void>) {
  const context = await browser.newContext({ storageState: authStatePath(role) })
  const page = await context.newPage()
  try {
    await use(page)
  } finally {
    await context.close()
  }
}

export const test = base.extend<RolePages>({
  adminPage: async ({ browser }, use) => {
    await withRolePage(browser, 'admin', use)
  },
  // `doctorPage` is doctorA — the referral *sender* in the two-doctor specs.
  doctorPage: async ({ browser }, use) => {
    await withRolePage(browser, 'doctorA', use)
  },
  doctorBPage: async ({ browser }, use) => {
    await withRolePage(browser, 'doctorB', use)
  },
  nursePage: async ({ browser }, use) => {
    await withRolePage(browser, 'nurse', use)
  },
  patientPage: async ({ browser }, use) => {
    await withRolePage(browser, 'patient', use)
  },
  labtechPage: async ({ browser }, use) => {
    await withRolePage(browser, 'labtech', use)
  },
  pharmacistPage: async ({ browser }, use) => {
    await withRolePage(browser, 'pharmacist', use)
  },
})

export { expect } from '@playwright/test'
