// The e2e stack deliberately runs on its own ports, not the dev defaults
// (3000 / 5173). A developer almost always has `npm run dev` up while tests
// run, and `reuseExistingServer: false` means Playwright refuses to share —
// so sharing ports meant every run died on "port already in use" until the
// dev server was stopped by hand.
//
// Separate ports also remove a genuine safety hazard: if Playwright ever DID
// attach to the dev server, the specs would be running against the real Atlas
// database instead of the ephemeral in-memory one.
//
// Single source of truth — imported by playwright.config.ts (to launch and
// proxy) and by fixtures/api.ts (to call the API directly).
export const E2E_API_PORT = 4100
export const E2E_CLIENT_PORT = 5273

export const E2E_API_ORIGIN = `http://localhost:${E2E_API_PORT}`
export const E2E_CLIENT_ORIGIN = `http://localhost:${E2E_CLIENT_PORT}`
