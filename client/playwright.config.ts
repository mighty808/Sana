import { defineConfig, devices } from '@playwright/test'
import { E2E_API_ORIGIN, E2E_API_PORT, E2E_CLIENT_ORIGIN, E2E_CLIENT_PORT } from './e2e/fixtures/ports'

// Runs the whole app end to end against an ephemeral, in-memory MongoDB —
// never the real Atlas dev database (see server/src/test/e2eServer.ts).
//
// `reuseExistingServer: false` on both webServer entries is the important
// safety property here, not just a perf knob: without it, Playwright's
// default behavior is to attach to whatever's already listening on that
// port rather than starting its own — and if a developer already has
// `npm run dev` running locally, that's the REAL server backed by the REAL
// Atlas database. Forcing a fresh spawn every time means a port conflict
// fails loudly (EADDRINUSE) instead of silently running e2e specs against
// production-adjacent data.
export default defineConfig({
  testDir: './e2e',
  // 60s rather than Playwright's default 30s. Several specs do a multi-step
  // API setup chain (patient → appointment → encounter → prescription →
  // invoice) before they touch the UI at all, and the heaviest of them
  // intermittently ran past 30s on a loaded machine — a timeout that says
  // nothing about the app. The budget is per test, so this costs nothing on
  // the ones that finish quickly.
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // One local retry (CI keeps two). This is for residual *load* flake, not for
  // papering over a bug: the real defect — asserting inside the window where
  // ProtectedRoute renders null during its silent token refresh — was found and
  // fixed in rbac.spec.ts, which took it from failing about half the time to
  // passing 3/3 in isolation. What remains is a ~1-in-4 wobble that only shows
  // up under full-suite load on a memory-pressured machine, never reproduces on
  // demand, and leaves no artifact to diagnose.
  //
  // Worth knowing: a retry hides a genuinely broken test just as well as it
  // hides a flaky one. If a spec starts needing its retry routinely, that's a
  // signal to investigate it, not to accept it — `npx playwright show-report`
  // flags which tests passed only on retry.
  retries: process.env.CI ? 2 : 1,
  reporter: 'html',
  use: {
    baseURL: E2E_CLIENT_ORIGIN,
    trace: 'on-first-retry',
    // Set SLOWMO=800 (milliseconds between actions) when running headed and
    // watching along — e.g. `SLOWMO=800 npx playwright test --headed
    // --workers=1`. Unset in every normal/CI run, where speed matters and
    // nobody's watching.
    launchOptions: process.env.SLOWMO ? { slowMo: Number(process.env.SLOWMO) } : {},
  },

  expect: {
    // Screenshot comparison is the flakiest thing in any Playwright suite, so
    // the tolerances are set deliberately rather than left at the defaults: a
    // small pixel-ratio allowance absorbs antialiasing/font-rendering noise,
    // and animations are frozen so a mid-transition frame can't be captured.
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
      caret: 'hide',
    },
  },

  // Baselines are platform-specific — a screenshot taken on Windows will never
  // match one taken on CI's Linux. Putting {platform} in the path lets both
  // live side by side instead of fighting over one file, so a local run can
  // keep its own baselines without invalidating the ones CI compares against.
  snapshotPathTemplate: '{testDir}/__screenshots__/{platform}/{projectName}/{testFileName}/{arg}{ext}',

  projects: [
    // Logs in as each seeded test role once and saves the resulting
    // session (an httpOnly refresh-token cookie) to e2e/.auth/<role>.json,
    // so the specs below don't each pay the cost of a real login.
    { name: 'setup', testMatch: /auth\.setup\.ts/ },

    // The default project — `npm run test:e2e` runs just this one (plus its
    // setup dependency). Visual specs are excluded so they only run in the
    // dedicated `visual` project below.
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
      testIgnore: [/auth\.setup\.ts/, /\.visual\.spec\.ts/],
    },
    // The real, installed Microsoft Edge (a Chromium "channel", not a
    // separate downloaded binary) — same specs, for watching a run in a more
    // familiar window. Opt in with `--project=edge`.
    {
      name: 'edge',
      use: { ...devices['Desktop Edge'], channel: 'msedge' },
      dependencies: ['setup'],
      testIgnore: [/auth\.setup\.ts/, /\.visual\.spec\.ts/],
    },
    // Phone viewport, deliberately only the specs tagged @mobile — running
    // the whole suite twice would double the time for very little extra
    // signal, since the app's logic doesn't change with viewport, only its
    // layout does.
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
      dependencies: ['setup'],
      grep: /@mobile/,
      testIgnore: [/auth\.setup\.ts/, /\.visual\.spec\.ts/],
    },
    // Screenshot comparisons, kept in their own project so an unrelated
    // visual diff can never fail a functional run.
    {
      name: 'visual',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
      testMatch: /\.visual\.spec\.ts/,
    },
  ],

  webServer: [
    {
      command: 'npm run test:e2e-server',
      cwd: '../server',
      url: `${E2E_API_ORIGIN}/api/v1/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        PORT: String(E2E_API_PORT),
        // Socket.IO validates the handshake's Origin against this (see
        // config/socket.ts), and the e2e client isn't on the default 5173.
        CLIENT_URL: E2E_CLIENT_ORIGIN,
      },
    },
    {
      command: 'npm run dev',
      cwd: '.',
      url: E2E_CLIENT_ORIGIN,
      reuseExistingServer: false,
      timeout: 30_000,
      env: {
        E2E_CLIENT_PORT: String(E2E_CLIENT_PORT),
        E2E_API_TARGET: E2E_API_ORIGIN,
      },
    },
  ],
})
