import { test, expect } from './fixtures/test'
import { createOpenEncounterForDoctor, uniqueTag } from './fixtures/api'

// The whole patient journey, end to end, through every role's real UI:
// Nurse records vitals -> Doctor diagnoses and orders a lab test -> Lab Tech
// enters, releases, and bills the result -> Doctor sees the released result
// and, informed by it, writes a prescription -> Pharmacist bills that
// prescription -> Admin pays both invoices -> Pharmacist dispenses the
// drug. The prescription deliberately comes *after* the lab result rather
// than alongside the diagnosis, since that's the clinically realistic
// order a doctor would actually follow.
//
// Setup (patient/appointment/encounter) goes through the API, same as every
// other spec in this suite — that's plumbing, not the behavior under test.
// Everything from vitals onward is UI-driven.
test('a patient visit runs from vitals through labs, a post-result prescription, billing, and dispensing', async ({
  nursePage,
  doctorPage,
  labtechPage,
  adminPage,
  pharmacistPage,
  request,
}) => {
  test.slow()
  const tag = uniqueTag()
  const testName = `E2E Test ${tag}`
  const drugName = `E2E-Drug-${tag}`

  const encounter = await createOpenEncounterForDoctor(request, 'kwamedoc@sana.test', tag)

  // --- Nurse records vitals ---
  await nursePage.goto(`/encounters/${encounter._id}`)
  await nursePage.getByLabel('Temp (°C)').fill('38.5')
  await nursePage.getByLabel('Heart rate (bpm)').fill('95')
  await nursePage.getByRole('button', { name: 'Record vitals' }).click()
  await expect(nursePage.getByText('38.5')).toBeVisible()

  // --- Doctor diagnoses and orders a lab test (no prescription yet — that
  // comes after the result, below) ---
  await doctorPage.goto(`/encounters/${encounter._id}`)
  await expect(doctorPage.getByText('95')).toBeVisible() // sees the nurse's vitals

  await doctorPage.getByLabel('Diagnosis').fill(`E2E diagnosis ${tag}`)
  await doctorPage.getByRole('button', { name: 'Add diagnosis' }).click()
  await expect(doctorPage.getByText(`E2E diagnosis ${tag}`)).toBeVisible()

  await doctorPage.getByRole('button', { name: 'Request lab tests' }).click()
  const orderDialog = doctorPage.getByRole('dialog')
  await orderDialog.getByLabel('Tests').fill(testName)
  await orderDialog.getByRole('button', { name: 'Request tests' }).click()
  await expect(doctorPage.getByText(testName)).toBeVisible()

  // --- Lab Tech enters the result, releases it, and bills the order ---
  await labtechPage.goto('/lab-orders')
  await labtechPage.getByRole('link', { name: new RegExp(tag) }).click()
  const labDialog = labtechPage.getByRole('dialog')
  await expect(labDialog).toBeVisible()

  await labDialog.getByRole('button', { name: 'Enter result' }).click()
  await labDialog.getByPlaceholder('e.g. Positive, 14.2').fill('Positive')
  await labDialog.getByRole('button', { name: 'Save result' }).click()
  await expect(labDialog.getByText('Positive')).toBeVisible()

  await labDialog.getByRole('button', { name: 'Release' }).click()
  await expect(labtechPage.getByText(`${testName} released to the patient`)).toBeVisible()

  await labDialog.getByRole('button', { name: 'Bill this order' }).click()
  const labBillToast = labtechPage.getByText(/created$/)
  await expect(labBillToast).toBeVisible()
  const labInvoiceNumber = (await labBillToast.textContent())!.replace(' created', '')

  // --- Doctor sees the released result (the "back to doctor for
  // confirmation" step), then writes a prescription informed by it ---
  await doctorPage.goto(`/encounters/${encounter._id}`)
  const orderItem = doctorPage.locator('li', { hasText: testName })
  await expect(orderItem.getByText('Completed')).toBeVisible()

  await doctorPage.goto('/lab-orders')
  await doctorPage.getByRole('link', { name: new RegExp(tag) }).click()
  const doctorLabDialog = doctorPage.getByRole('dialog')
  await expect(doctorLabDialog.getByText('Positive')).toBeVisible()
  await doctorPage.keyboard.press('Escape')

  await doctorPage.goto(`/encounters/${encounter._id}`)
  await doctorPage.getByLabel('Drug').fill(drugName)
  await doctorPage.getByLabel('Dosage').fill('500mg')
  await doctorPage.getByLabel('Frequency').fill('3x daily')
  await doctorPage.getByLabel('Duration').fill('5 days')
  await doctorPage.getByRole('button', { name: 'Write prescription' }).click()
  await expect(doctorPage.getByText(drugName)).toBeVisible()

  // --- Pharmacist bills the prescription ---
  await pharmacistPage.goto('/prescriptions')
  const rxRow = pharmacistPage.getByRole('row', { name: new RegExp(tag) })
  await rxRow.click()
  const rxDialog = pharmacistPage.getByRole('dialog')
  const rxItem = rxDialog.locator('li', { hasText: drugName })
  await rxItem.getByRole('button', { name: 'Bill this prescription' }).click()
  const rxBillToast = pharmacistPage.getByText(/created$/)
  await expect(rxBillToast).toBeVisible()
  const rxInvoiceNumber = (await rxBillToast.textContent())!.replace(' created', '')
  await pharmacistPage.keyboard.press('Escape')

  // --- Admin pays both invoices in full ---
  await adminPage.goto('/invoices')
  await adminPage.getByRole('link', { name: new RegExp(tag) }).click()
  await expect(adminPage).toHaveURL(/\/patients\/[a-f0-9]{24}\?tab=invoices$/)

  for (const invoiceNumber of [labInvoiceNumber, rxInvoiceNumber]) {
    await adminPage.getByRole('link', { name: new RegExp(invoiceNumber) }).click()
    await expect(adminPage).toHaveURL(/\/invoices\/[a-f0-9]{24}$/)
    // The Amount field defaults to the full outstanding balance, so
    // submitting without touching it pays the invoice off in one go.
    await adminPage.getByRole('button', { name: 'Record payment' }).click()
    const paymentDialog = adminPage.getByRole('dialog')
    await paymentDialog.getByRole('button', { name: 'Record payment' }).click()
    await expect(paymentDialog).toBeHidden()
    await expect(adminPage.getByText('Paid').first()).toBeVisible()
    // Back to the patient's Invoices tab (not all the way to /invoices) —
    // the next invoice's link lives there, not on the patient-summary page.
    await adminPage.goBack()
  }

  // --- Pharmacist dispenses the prescription ---
  await pharmacistPage.goto('/prescriptions')
  await rxRow.click()
  const rxDialogAfterPayment = pharmacistPage.getByRole('dialog')
  const rxItemAfterPayment = rxDialogAfterPayment.locator('li', { hasText: drugName })
  await rxItemAfterPayment.getByRole('button', { name: 'Dispense' }).click()
  await expect(pharmacistPage.getByText(/dispensed$/)).toBeVisible()

  await pharmacistPage.keyboard.press('Escape')
  await rxRow.click()
  const finalDialog = pharmacistPage.getByRole('dialog')
  await expect(finalDialog.locator('li', { hasText: drugName })).toContainText('Dispensed')
})
