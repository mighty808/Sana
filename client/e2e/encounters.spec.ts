import { test, expect } from './fixtures/test'
import { createOpenEncounterForDoctor, uniqueTag } from './fixtures/api'

test.describe('encounters', () => {
  test('the encounters list and ward board render', async ({ doctorPage, request }) => {
    const tag = uniqueTag()
    await createOpenEncounterForDoctor(request, 'kwamedoc@sana.test', tag)

    await doctorPage.goto('/encounters')
    // Rows here set role="link" (the row navigates to the encounter), so they
    // aren't role="row" — same as the patients table.
    await expect(doctorPage.getByRole('link', { name: new RegExp(tag) })).toBeVisible()

    await doctorPage.goto('/ward-board')
    // The ward board is a different view over the same open encounters, so
    // the encounter created above has to show up here too.
    await expect(doctorPage.getByText(new RegExp(tag))).toBeVisible()
  })

  test('a nurse records vitals on an open encounter', async ({ nursePage, request }) => {
    const tag = uniqueTag()
    const encounter = await createOpenEncounterForDoctor(request, 'kwamedoc@sana.test', tag)

    await nursePage.goto(`/encounters/${encounter._id}`)

    // With no vitals recorded yet the form is already expanded — the
    // "Record vitals" collapsed trigger only appears once some exist.
    await nursePage.getByLabel('Temp (°C)').fill('37.2')
    await nursePage.getByLabel('Heart rate (bpm)').fill('82')
    await nursePage.getByRole('button', { name: 'Record vitals' }).click()

    await expect(nursePage.getByText('37.2')).toBeVisible()
    await expect(nursePage.getByText('82')).toBeVisible()
  })

  test('a doctor diagnoses, prescribes, orders labs and completes the encounter', async ({ doctorPage, request }) => {
    const tag = uniqueTag()
    const encounter = await createOpenEncounterForDoctor(request, 'kwamedoc@sana.test', tag)

    await doctorPage.goto(`/encounters/${encounter._id}`)

    // --- Diagnosis ---
    await doctorPage.getByLabel('Diagnosis').fill(`E2E diagnosis ${tag}`)
    await doctorPage.getByRole('button', { name: 'Add diagnosis' }).click()
    await expect(doctorPage.getByText(`E2E diagnosis ${tag}`)).toBeVisible()

    // --- Prescription ---
    await doctorPage.getByLabel('Drug').fill(`E2E-Drug-${tag}`)
    await doctorPage.getByLabel('Dosage').fill('500mg')
    await doctorPage.getByLabel('Frequency').fill('3x daily')
    await doctorPage.getByLabel('Duration').fill('5 days')
    await doctorPage.getByRole('button', { name: 'Write prescription' }).click()
    await expect(doctorPage.getByText(`E2E-Drug-${tag}`)).toBeVisible()

    // --- Completing the encounter ---
    // This is the irreversible step, so it's last: once COMPLETED, the
    // sub-record forms above all refuse further writes (assertEncounterOpen).
    await doctorPage.getByRole('button', { name: 'Complete encounter' }).click()
    const confirm = doctorPage.getByRole('alertdialog')
    if (await confirm.isVisible().catch(() => false)) {
      await confirm.getByRole('button', { name: /Complete/ }).click()
    }
    await expect(doctorPage.getByText('Completed').first()).toBeVisible()

    // Once closed, the write forms are gone — assertEncounterOpen would reject
    // these server-side, so offering the controls would only invite a failure.
    await expect(doctorPage.getByRole('button', { name: 'Add diagnosis' })).toHaveCount(0)
    await expect(doctorPage.getByRole('button', { name: 'Write prescription' })).toHaveCount(0)
    await expect(doctorPage.getByRole('button', { name: 'Send referral' })).toHaveCount(0)
  })

  test('the referral picker never offers the doctor themselves', async ({ doctorPage, request }) => {
    // createReferral rejects a self-referral with INVALID_REFERRAL_TARGET. The
    // UI shouldn't let it be selected in the first place.
    const tag = uniqueTag()
    const encounter = await createOpenEncounterForDoctor(request, 'kwamedoc@sana.test', tag)

    await doctorPage.goto(`/encounters/${encounter._id}`)
    await doctorPage.getByRole('combobox', { name: 'Refer to' }).click()

    await expect(doctorPage.getByRole('option', { name: 'Dr. Nana Yeboah' })).toBeVisible()
    await expect(doctorPage.getByRole('option', { name: 'Dr. Kwame Doctor' })).toHaveCount(0)
  })
})
