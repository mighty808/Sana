import { test, expect } from './fixtures/test'
import { uniqueTag } from './fixtures/api'

// Reads against the five seeded baseline patients (server/src/test/e2eSeed.ts),
// and one write that registers its own tagged patient rather than touching
// them — the seeded five are shared with every other spec in the run, so
// mutating them here would make somebody else's assertions flaky.
test.describe('patients', () => {
  test('a seeded patient can be found by search and opened', async ({ nursePage }) => {
    await nursePage.goto('/patients')

    await nursePage.getByPlaceholder('Search by name, patient number, or phone').fill('Boateng')

    // Rows on this page set role="link" explicitly (the whole row navigates
    // to the patient), so they are NOT role="row" the way other tables are.
    const row = nursePage.getByRole('link', { name: /Ama Boateng/ })
    await expect(row).toBeVisible()

    await row.click()
    await expect(nursePage).toHaveURL(/\/patients\/[a-f0-9]{24}$/)
    await expect(nursePage.getByRole('heading', { name: /Ama Boateng/ })).toBeVisible()

    // The detail page's timeline is tabbed; these three should be present even
    // when the patient has no history yet.
    for (const tab of ['Encounters', 'Lab Results', 'Prescriptions']) {
      await expect(nursePage.getByRole('tab', { name: tab })).toBeVisible()
    }
    // A nurse has no 'invoice.read', so the server sends them no invoices. The
    // tab is left out rather than shown empty, because "No invoices yet" would
    // wrongly tell them a patient with bills has none. Admin, Doctor, Pharmacist
    // and Lab Tech still get it (billing.spec.ts covers the admin side).
    await expect(nursePage.getByRole('tab', { name: 'Invoices' })).toHaveCount(0)
  })

  test('a nurse can register a new patient and find it', async ({ nursePage }) => {
    const tag = uniqueTag()

    await nursePage.goto('/patients')
    await nursePage.getByRole('button', { name: 'Add patient' }).click()

    const dialog = nursePage.getByRole('dialog')
    await expect(dialog.getByText('Register a new patient')).toBeVisible()

    await dialog.getByLabel('First name').fill('E2E')
    await dialog.getByLabel('Last name').fill(`Registered ${tag}`)
    await dialog.getByLabel('Date of birth').fill('1990-05-12')
    await dialog.getByRole('combobox', { name: 'Gender' }).click()
    await nursePage.getByRole('option', { name: 'Female' }).click()
    // exact, or it also matches "Emergency contact phone" — getByLabel
    // substring-matches by default.
    await dialog.getByLabel('Phone', { exact: true }).fill('0201234567')

    await dialog.getByRole('button', { name: 'Register patient' }).click()
    await expect(dialog).toBeHidden()

    // Found by its own tag — never by "the first row", since other specs are
    // registering patients into this same database at the same time.
    await nursePage.getByPlaceholder('Search by name, patient number, or phone').fill(tag)
    await expect(nursePage.getByRole('link', { name: new RegExp(tag) })).toBeVisible()
  })

  test('registering with required fields missing shows validation, not a silent failure', async ({ nursePage }) => {
    await nursePage.goto('/patients')
    await nursePage.getByRole('button', { name: 'Add patient' }).click()

    const dialog = nursePage.getByRole('dialog')
    // Only a first name — last name, DOB and gender are all required.
    await dialog.getByLabel('First name').fill('E2E')
    await dialog.getByRole('button', { name: 'Register patient' }).click()

    // The dialog stays open with the form intact, so nothing typed is lost.
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText(/required/i).first()).toBeVisible()
  })
})
