import { test, expect } from './fixtures/test'
import { sendReferral } from './fixtures/api'

test('Admin sees a "Mine / All" toggle, and All shows another user\'s notification', async ({
  adminPage,
  request,
}) => {
  // Something for the oversight feed to actually show — a referral from one
  // doctor to the other, which notify()s the receiving doctor (see
  // referral.service.ts's createReferral). Admin isn't a party to this at all,
  // which is the point: this notification belongs to a doctor, not to Admin's
  // own personal list.
  await sendReferral(request, 'kwamedoc@sana.test', 'nanadoc@sana.test')

  await adminPage.goto('/notifications')
  await expect(adminPage.getByRole('tab', { name: 'Mine' })).toBeVisible()
  await expect(adminPage.getByRole('tab', { name: 'All' })).toBeVisible()

  await adminPage.getByRole('tab', { name: 'All' }).click()
  await expect(adminPage.getByText('New referral').first()).toBeVisible()
  await expect(adminPage.getByText('To Nana Yeboah').first()).toBeVisible()
})

test('a non-admin role never sees the Mine / All toggle', async ({ nursePage }) => {
  await nursePage.goto('/notifications')
  await expect(nursePage.getByText('Everything sent to you, newest first.')).toBeVisible()
  await expect(nursePage.getByRole('tab', { name: 'All' })).toHaveCount(0)
})
