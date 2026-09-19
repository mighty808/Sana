import { test, expect } from './fixtures/test'
import { createEncounterForPatient, findPortalPatientId, orderLabTest, uniqueTag } from './fixtures/api'

// Doctor orders → Lab Tech enters the result → Lab Tech releases it → the
// patient can finally see it. The release step is the interesting one: an
// ENTERED result is deliberately invisible to the patient until a lab tech
// releases it.
test('a lab order runs from request through to a released result the patient can see', async ({
  labtechPage,
  patientPage,
  request,
}) => {
  const tag = uniqueTag()

  // Ordered against the portal-linked patient specifically, so the last leg
  // of this test — the patient seeing their own result — is possible at all.
  const patientId = await findPortalPatientId(request)
  const encounter = await createEncounterForPatient(request, { patientId, doctorEmail: 'kwamedoc@sana.test' })
  const order = await orderLabTest(request, encounter._id, { tag })

  // --- Lab tech enters the result ---
  await labtechPage.goto('/lab-orders')
  await labtechPage.getByRole('link', { name: new RegExp(tag) }).click()

  const dialog = labtechPage.getByRole('dialog')
  await expect(dialog).toBeVisible()

  await dialog.getByRole('button', { name: 'Enter result' }).click()
  // The test dropdown pre-selects the first pending test, which is the only
  // one on this order.
  await dialog.getByPlaceholder('e.g. Positive, 14.2').fill('13.4')
  await dialog.getByRole('button', { name: 'Save result' }).click()

  // --- ...and releases it ---
  await expect(dialog.getByText('13.4')).toBeVisible()
  await dialog.getByRole('button', { name: 'Release' }).click()
  await expect(labtechPage.getByText(`${order.testName} released to the patient`)).toBeVisible()

  // --- The patient can now see it ---
  await patientPage.goto('/lab-results')
  await expect(patientPage.getByText(order.testName)).toBeVisible()
})
