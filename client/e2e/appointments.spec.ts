import { test, expect } from './fixtures/test'
import { bookAppointment, registerPatient, uniqueTag } from './fixtures/api'

test.describe('appointments', () => {
  test('a nurse can book an appointment through the booking dialog', async ({ nursePage, request }) => {
    // Its own patient rather than a seeded one: booking mutates state (the
    // doctor's calendar), and the seeded five are shared with every other
    // spec running at the same time.
    const tag = uniqueTag()
    const patient = await registerPatient(request, tag)

    await nursePage.goto('/appointments')
    await nursePage.getByRole('button', { name: 'Book appointment' }).click()

    const dialog = nursePage.getByRole('dialog')
    await expect(dialog.getByText('Book an appointment')).toBeVisible()

    // The patient picker searches server-side rather than listing everyone,
    // so the tag has to be typed before the option exists.
    await dialog.getByRole('combobox', { name: 'Patient' }).click()
    await nursePage.getByPlaceholder('Search patients…').fill(tag)
    await nursePage.getByRole('option', { name: new RegExp(patient.patientNumber) }).click()

    await dialog.getByRole('combobox', { name: 'Doctor' }).click()
    await nursePage.getByRole('option', { name: 'Dr. Kwame Doctor' }).click()

    // Opened from the page-level button, the dialog has no pre-filled date
    // (that only happens when booking from a specific day in the calendar),
    // so the required Date field has to be set here.
    await dialog.getByLabel('Date').fill(new Date().toISOString().slice(0, 10))
    // A slot far from the randomized ones the API factories use, so a
    // parallel spec can't double-book this doctor out from under the test.
    await dialog.getByLabel('Start').fill('21:00')
    await dialog.getByLabel('End').fill('21:30')
    await dialog.getByPlaceholder('Reason for the visit').fill(`E2E booking ${tag}`)

    await dialog.getByRole('button', { name: 'Book appointment' }).click()

    await expect(dialog).toBeHidden()
    await expect(nursePage.getByRole('row', { name: new RegExp(tag) })).toBeVisible()
  })

  test('double-booking a slot shows the conflict instead of failing silently', async ({ nursePage, request }) => {
    // appointment.service.ts rejects an overlapping slot with a 409. Jest
    // already proves the rule; what matters here is that the nurse is told —
    // a silent no-op would look like the booking worked.
    const tag = uniqueTag()
    const patient = await registerPatient(request, tag)
    const today = new Date().toISOString().slice(0, 10)
    // Take the slot first, via the API, so the UI attempt is guaranteed to collide.
    await bookAppointment(request, {
      patientId: patient._id,
      doctorEmail: 'kwamedoc@sana.test',
      date: today,
      startTime: '20:00',
      endTime: '20:30',
    })

    await nursePage.goto('/appointments')
    await nursePage.getByRole('button', { name: 'Book appointment' }).click()
    const dialog = nursePage.getByRole('dialog')

    await dialog.getByRole('combobox', { name: 'Patient' }).click()
    await nursePage.getByPlaceholder('Search patients…').fill(tag)
    await nursePage.getByRole('option', { name: new RegExp(patient.patientNumber) }).click()
    await dialog.getByRole('combobox', { name: 'Doctor' }).click()
    await nursePage.getByRole('option', { name: 'Dr. Kwame Doctor' }).click()
    await dialog.getByLabel('Date').fill(today)
    await dialog.getByLabel('Start').fill('20:00')
    await dialog.getByLabel('End').fill('20:30')

    await dialog.getByRole('button', { name: 'Book appointment' }).click()

    await expect(nursePage.getByText(/already has an appointment/i)).toBeVisible()
    // Still open, so the nurse can pick another time rather than losing the form.
    await expect(dialog).toBeVisible()
  })

  test('a nurse can start an encounter from a booked appointment', async ({ nursePage, request }) => {
    const tag = uniqueTag()
    const patient = await registerPatient(request, tag)
    // Pinned to today: the appointments page shows one day at a time, so a
    // booking on a random future date wouldn't be on screen to act on.
    await bookAppointment(request, {
      patientId: patient._id,
      doctorEmail: 'kwamedoc@sana.test',
      date: new Date().toISOString().slice(0, 10),
    })

    await nursePage.goto('/appointments')

    const row = nursePage.getByRole('row', { name: new RegExp(tag) })
    await expect(row).toBeVisible()
    await row.getByRole('button', { name: 'Start encounter' }).click()

    const dialog = nursePage.getByRole('dialog')
    await expect(dialog.getByText('Start an encounter')).toBeVisible()
    await dialog.getByPlaceholder('What brought them in today').fill(`E2E complaint ${tag}`)
    await dialog.getByRole('button', { name: 'Start encounter' }).click()

    // Starting an encounter takes the nurse straight into it to record vitals.
    await expect(nursePage).toHaveURL(/\/encounters\/[a-f0-9]{24}$/)
    await expect(nursePage.getByText(`E2E complaint ${tag}`)).toBeVisible()
  })
})
