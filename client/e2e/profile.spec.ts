import { test, expect } from './fixtures/test'

// ProfilePage is read-only — it shows the signed-in account's own details
// rather than offering an edit form, so this checks it resolves the right
// person for two different roles.
test('a doctor sees their own account details', async ({ doctorPage }) => {
  await doctorPage.goto('/profile')

  await expect(doctorPage.getByText('My profile')).toBeVisible()
  await expect(doctorPage.getByText('kwamedoc@sana.test')).toBeVisible()
  // exact, because getByText substring-matches: a bare 'DOCTOR' also hits
  // "Kwame Doctor" in the sidebar, the header, and the profile body.
  await expect(doctorPage.getByText('DOCTOR', { exact: true })).toBeVisible()
})

test('a pharmacist sees their own account details, not someone else\'s', async ({ pharmacistPage }) => {
  await pharmacistPage.goto('/profile')

  await expect(pharmacistPage.getByText('efuapharm@sana.test')).toBeVisible()
  await expect(pharmacistPage.getByText('PHARMACIST', { exact: true })).toBeVisible()
})
