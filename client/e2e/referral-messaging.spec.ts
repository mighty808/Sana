import { test, expect } from './fixtures/test'
import { createOpenEncounterForDoctor, sendReferral, uniqueTag } from './fixtures/api'

// The real-time, two-doctor flow: a referral, its message thread, the sidebar
// unread badge, and the live update when the other side replies. Both doctors'
// pages come from the per-role fixtures, so the two sessions genuinely run
// side by side — the point is proving the cross-user, socket-driven behaviour
// actually works, not just that each side renders correctly on its own.
test('doctor A refers a patient to doctor B, and they message each other live', async ({
  doctorPage,
  doctorBPage,
  request,
}) => {
  const tag = uniqueTag()
  const reason = `Second opinion needed ${tag}`
  const encounter = await createOpenEncounterForDoctor(request, 'kwamedoc@sana.test', tag)

  // --- Doctor A sends the referral ---
  // The "refer to another doctor" form starts already expanded on a fresh
  // encounter (no existing referrals yet) — same "collapse once something
  // exists" shape the Diagnoses form uses — so there's no trigger to click.
  await doctorPage.goto(`/encounters/${encounter._id}`)
  await doctorPage.getByRole('combobox', { name: 'Refer to' }).click()
  await doctorPage.getByRole('option', { name: 'Dr. Nana Yeboah' }).click()
  await doctorPage.getByPlaceholder('e.g. Cardiology opinion needed').fill(reason)
  await doctorPage.getByRole('button', { name: 'Send referral' }).click()
  await expect(doctorPage.getByText('Referral sent')).toBeVisible()

  // Doctor A opens the thread and leaves it open — this is what proves the
  // live update below actually arrives over the socket, rather than a fresh
  // fetch eventually showing it.
  await doctorPage.getByRole('button', { name: 'Messages' }).click()
  await expect(doctorPage.getByRole('dialog')).toBeVisible()

  // --- Doctor B sees it arrive, and replies ---
  // Other spec files also send this doctor referrals and share the same
  // ephemeral DB, so the badge count isn't deterministically "1", just
  // non-zero — and this test's own row is found by its unique reason.
  await doctorBPage.goto('/referrals')
  await expect(doctorBPage.getByRole('link', { name: /Referrals/ })).toContainText(/[1-9]/)

  const row = doctorBPage.getByRole('row', { name: new RegExp(tag) })
  // The unread dot is a plain <span aria-label="Unread">, not a form control,
  // so it's targeted by attribute rather than getByLabel (which Playwright
  // resolves against labelled form elements).
  await expect(row.locator('[aria-label="Unread"]')).toBeVisible()

  await row.getByRole('button', { name: 'Messages' }).click()
  const dialogB = doctorBPage.getByRole('dialog')
  await expect(dialogB).toContainText('Dr. Kwame Doctor')
  await dialogB.getByPlaceholder('Write a message…').fill(`Thanks, sending them over now ${tag}`)
  await dialogB.getByRole('button', { name: 'Send' }).click()
  await expect(dialogB.getByText(`Thanks, sending them over now ${tag}`)).toBeVisible()

  // --- Doctor A's already-open dialog updates live, with no reload ---
  await expect(doctorPage.getByRole('dialog').getByText(`Thanks, sending them over now ${tag}`)).toBeVisible()
})

test('the sending doctor finds their referral under Sent, with no status control', async ({ doctorPage, request }) => {
  const tag = uniqueTag()
  await sendReferral(request, 'kwamedoc@sana.test', 'nanadoc@sana.test', tag)

  await doctorPage.goto('/referrals')

  // It is NOT on the incoming tab — that one only lists referrals sent *to*
  // this doctor, and this one went the other way.
  await expect(doctorPage.getByRole('row', { name: new RegExp(tag) })).toHaveCount(0)

  await doctorPage.getByRole('tab', { name: 'Sent' }).click()
  const row = doctorPage.getByRole('row', { name: new RegExp(tag) })
  await expect(row).toBeVisible()
  // The recipient is the useful name here, not the sender.
  await expect(row).toContainText('Dr. Nana Yeboah')

  // Only the receiving doctor can advance a referral (updateReferralStatus
  // scopes its query to toDoctor), so the sender must not be offered a
  // control that would always fail.
  await expect(row.getByRole('button', { name: /^Mark / })).toHaveCount(0)
})
