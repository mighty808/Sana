import { test, expect } from './fixtures/test'
import { createOpenEncounterForDoctor, dispensePrescription, uniqueTag, writePrescription } from './fixtures/api'

test('a pharmacist dispenses a prescription, and the prescribing doctor is notified', async ({
  pharmacistPage,
  doctorPage,
  request,
}) => {
  const tag = uniqueTag()
  const encounter = await createOpenEncounterForDoctor(request, 'kwamedoc@sana.test', tag)
  const prescription = await writePrescription(request, encounter._id, { tag })

  // --- The pharmacy queue ---
  // Pharmacist (and Admin) see every prescription; the doctor only sees their
  // own. This is the queue the pharmacist actually works from.
  await pharmacistPage.goto('/prescriptions')

  // The queue table lists patient / doctor / medications / status / written —
  // no prescription number and no action buttons. Rows are found by the
  // tagged drug name, and dispensing happens in the detail dialog a row
  // click opens.
  const row = pharmacistPage.getByRole('row', { name: new RegExp(tag) })
  await expect(row).toBeVisible()
  await row.click()

  const detail = pharmacistPage.getByRole('dialog')
  await expect(detail.getByText(prescription.prescriptionNumber)).toBeVisible()

  await detail.getByRole('button', { name: 'Dispense' }).click()
  await expect(pharmacistPage.getByText(`${prescription.prescriptionNumber} dispensed`)).toBeVisible()

  // Dispensing is one-way (dispensePrescription only accepts a PRESCRIBED
  // one), and the queue reflects it. The grouped row itself has no Status
  // column (only the per-prescription item inside the dialog does), and the
  // dialog renders from a snapshot taken when it opened, so the button is
  // still on screen until it's reopened — close and reopen it to see the
  // updated badge.
  await pharmacistPage.keyboard.press('Escape')
  await row.click()
  const reopened = pharmacistPage.getByRole('dialog')
  const item = reopened.locator('li', { hasText: prescription.prescriptionNumber })
  await expect(item).toContainText('Dispensed')

  // --- The prescribing doctor hears about it ---
  await doctorPage.goto('/notifications')
  await expect(doctorPage.getByText('Prescription dispensed').first()).toBeVisible()
  await expect(doctorPage.getByText(new RegExp(prescription.prescriptionNumber)).first()).toBeVisible()
})

test('an already-dispensed prescription offers no way to dispense it again', async ({
  pharmacistPage,
  request,
}) => {
  // dispensePrescription only accepts a PRESCRIBED one, so a second attempt is
  // a 409 at the API. What this checks is the half Jest can't see: that the UI
  // doesn't offer the action at all, rather than letting the pharmacist click
  // into a failure.
  const tag = uniqueTag()
  const encounter = await createOpenEncounterForDoctor(request, 'kwamedoc@sana.test', tag)
  const prescription = await writePrescription(request, encounter._id, { tag })
  await dispensePrescription(request, prescription._id)

  await pharmacistPage.goto('/prescriptions')
  const row = pharmacistPage.getByRole('row', { name: new RegExp(tag) })
  await expect(row).toBeVisible()

  await row.click()
  const detail = pharmacistPage.getByRole('dialog')
  const item = detail.locator('li', { hasText: prescription.prescriptionNumber })
  await expect(item).toContainText('Dispensed')
  await expect(item.getByRole('button', { name: 'Dispense' })).toHaveCount(0)
})
