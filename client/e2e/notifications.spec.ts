import { test, expect } from './fixtures/test'
import { sendReferral, uniqueTag } from './fixtures/api'

test('a notification arrives, shows on the bell, and can be marked read', async ({ doctorPage, request }) => {
  const tag = uniqueTag()
  // A referral from the other doctor is the simplest way to generate a real
  // notification addressed to this one (referral.service.ts's createReferral
  // calls notify() on the receiving doctor).
  await sendReferral(request, 'nanadoc@sana.test', 'kwamedoc@sana.test', tag)

  await doctorPage.goto('/dashboard')

  // The bell badge counts unread notifications. Other specs notify this same
  // doctor too, so this asserts "some unread", not an exact number.
  const bell = doctorPage.getByRole('button', { name: 'Notifications' })
  await expect(bell).toContainText(/[1-9]/)

  await bell.click()
  const panel = doctorPage.getByRole('dialog')
  await expect(panel.getByText('New referral').first()).toBeVisible()

  // Clicking a notification marks it read and navigates to the entity it
  // points at — for a referral, the referrals worklist.
  await panel.getByText('New referral').first().click()
  await expect(doctorPage).toHaveURL(/\/referrals$/)
})

test('the notifications page lists what was sent to you', async ({ doctorPage, request }) => {
  const tag = uniqueTag()
  await sendReferral(request, 'nanadoc@sana.test', 'kwamedoc@sana.test', tag)

  await doctorPage.goto('/notifications')
  await expect(doctorPage.getByText('Everything sent to you, newest first.')).toBeVisible()
  await expect(doctorPage.getByText('New referral').first()).toBeVisible()
})
