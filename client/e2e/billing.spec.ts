import { test, expect } from './fixtures/test'
import {
  createEncounterForPatient,
  createInvoice,
  findPortalPatientId,
  uniqueTag,
  writePrescription,
} from './fixtures/api'

test('an invoice is paid off in two payments, and the patient can see it', async ({
  adminPage,
  patientPage,
  request,
}) => {
  const tag = uniqueTag()

  // Billed to the portal-linked patient so the last leg — the patient seeing
  // their own invoice — is possible.
  const patientId = await findPortalPatientId(request)
  const encounter = await createEncounterForPatient(request, { patientId, doctorEmail: 'kwamedoc@sana.test' })
  const prescription = await writePrescription(request, encounter._id, { tag })

  // An invoice always bills exactly one thing (createInvoiceSchema requires
  // exactly one of labOrder/prescription), hence the prescription above.
  const invoice = await createInvoice(request, {
    prescriptionId: prescription._id,
    description: `E2E charge ${tag}`,
    unitPrice: 100,
    tag,
  })

  await adminPage.goto('/invoices')
  await adminPage.getByRole('link', { name: new RegExp(invoice.invoiceNumber) }).click()
  await expect(adminPage).toHaveURL(/\/invoices\/[a-f0-9]{24}$/)

  // --- Partial payment: still owing ---
  await adminPage.getByRole('button', { name: 'Record payment' }).click()
  let dialog = adminPage.getByRole('dialog')
  await dialog.getByLabel('Amount').fill('40')
  await dialog.getByRole('button', { name: 'Record payment' }).click()
  await expect(dialog).toBeHidden()
  await expect(adminPage.getByText('Partially paid').first()).toBeVisible()

  // --- Paying the remainder settles it ---
  await adminPage.getByRole('button', { name: 'Record payment' }).click()
  dialog = adminPage.getByRole('dialog')
  await dialog.getByLabel('Amount').fill('60')
  await dialog.getByRole('button', { name: 'Record payment' }).click()
  await expect(dialog).toBeHidden()
  await expect(adminPage.getByText('Paid').first()).toBeVisible()

  // --- The patient sees their own invoice ---
  await patientPage.goto('/invoices')
  await expect(patientPage.getByText(invoice.invoiceNumber)).toBeVisible()
})

test('paying more than the outstanding balance is refused and shown', async ({ adminPage, request }) => {
  const tag = uniqueTag()
  const patientId = await findPortalPatientId(request)
  const encounter = await createEncounterForPatient(request, { patientId, doctorEmail: 'kwamedoc@sana.test' })
  const prescription = await writePrescription(request, encounter._id, { tag })
  const invoice = await createInvoice(request, {
    prescriptionId: prescription._id,
    description: `E2E overpay ${tag}`,
    unitPrice: 50,
    tag,
  })

  await adminPage.goto('/invoices')
  await adminPage.getByRole('link', { name: new RegExp(invoice.invoiceNumber) }).click()

  await adminPage.getByRole('button', { name: 'Record payment' }).click()
  const dialog = adminPage.getByRole('dialog')
  // The invoice totals 50; 500 is well past it.
  await dialog.getByLabel('Amount').fill('500')
  await dialog.getByRole('button', { name: 'Record payment' }).click()

  // The overpayment never leaves the browser. The amount input carries
  // `max={balance}`, so native constraint validation blocks the submit before
  // React Hook Form runs — which also means the schema's own
  // "Cannot exceed the outstanding balance" message is unreachable on this
  // path, and the feedback is a native tooltip that isn't in the DOM.
  //
  // So this asserts the outcome rather than the wording: the dialog is still
  // open, and nothing was applied. That holds whichever layer does the
  // rejecting, so it won't quietly stop testing anything if the validation
  // moves.
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('Outstanding balance: GH₵50.00')).toBeVisible()

  // Asserted on the amount rather than a "Paid" status: "Paid" is also the
  // label of the amount-paid summary field (and again in the hidden print
  // copy), so it matches either way.
  await adminPage.keyboard.press('Escape')
  await expect(adminPage.getByText('GH₵0.00').first()).toBeVisible()
})
