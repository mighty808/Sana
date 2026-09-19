import { test, expect } from './fixtures/test'
import { loginAs, uniqueTag } from './fixtures/api'

test('an admin creates a user account that can then actually sign in', async ({ adminPage, request }) => {
  const tag = uniqueTag()
  const email = `e2e.${tag.toLowerCase()}@sana.test`
  const password = 'Password123!'

  await adminPage.goto('/users')
  await adminPage.getByRole('button', { name: 'Add user' }).click()

  const dialog = adminPage.getByRole('dialog')
  await expect(dialog.getByText('Add a user account')).toBeVisible()

  await dialog.getByLabel('First name').fill('E2E')
  await dialog.getByLabel('Last name').fill(`Staff ${tag}`)
  await dialog.getByLabel('Email').fill(email)
  await dialog.getByLabel('Temporary password').fill(password)
  await dialog.getByRole('combobox', { name: 'Role' }).click()
  await adminPage.getByRole('option', { name: 'Nurse' }).click()

  await dialog.getByRole('button', { name: 'Create account' }).click()
  await expect(dialog).toBeHidden()
  await expect(adminPage.getByRole('row', { name: new RegExp(tag) })).toBeVisible()

  // The real proof that the account was created properly — not just that a
  // row appeared, but that the credentials work against the actual login
  // endpoint (password hashed, role assigned, status ACTIVE).
  const token = await loginAs(request, email, password)
  expect(token).toBeTruthy()
})
