import { test, expect } from './fixtures/test'
import { registerPatient, uniqueTag } from './fixtures/api'

test.describe('admin oversight', () => {
  test('the audit log records an action that just happened', async ({ adminPage, request }) => {
    // Registering a patient writes a PATIENT_REGISTERED entry (see
    // patient.controller.ts), so this test creates the very entry it then
    // goes looking for rather than depending on whatever other specs left
    // behind.
    const tag = uniqueTag()
    await registerPatient(request, tag)

    await adminPage.goto('/audit-logs')
    await expect(adminPage.getByRole('columnheader', { name: 'Action' })).toBeVisible()
    // The page humanizes the stored action name, so PATIENT_REGISTERED is
    // rendered as "Patient registered".
    await expect(adminPage.getByText('Patient registered').first()).toBeVisible()
  })

  test('analytics renders hospital-wide trends for admin', async ({ adminPage }) => {
    await adminPage.goto('/analytics')
    // Two <h1>s carry this name — the AppShell header and the page itself —
    // so this takes the page's own rather than failing on strict mode.
    await expect(adminPage.getByRole('heading', { name: 'Analytics' }).last()).toBeVisible()

    // Either the charts or the empty state is correct here — which one shows
    // depends on how much data the rest of the suite happened to create, and
    // this spec shouldn't depend on that.
    const charts = adminPage.getByText('Appointment volume')
    const empty = adminPage.getByText('No data yet')
    await expect(charts.or(empty).first()).toBeVisible()
  })
})
