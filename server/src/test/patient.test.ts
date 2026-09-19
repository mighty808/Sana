import { createPatient, getPatientById, updatePatient, getPatientTimeline, getPatientForUser, searchPatients } from '../services/patient.service.js'
import { Patient } from '../models/Patient.js'
import { connectTestDb, clearTestDb, disconnectTestDb, DB_BOOT_TIMEOUT_MS } from './setupTestDb.js'
import { createUser, createPatient as createPatientFixture, createEncounter, createTestInvoice, createLabOrder, createPrescription } from './factories.js'

beforeAll(connectTestDb, DB_BOOT_TIMEOUT_MS)
afterEach(clearTestDb)
afterAll(disconnectTestDb, DB_BOOT_TIMEOUT_MS)

describe('createPatient', () => {
  test('generates a patientNumber and stores the given fields', async () => {
    const patient = await createPatient({
      firstName: 'Ama',
      lastName: 'Mensah',
      dob: new Date('1995-05-01'),
      gender: 'FEMALE',
    })
    expect(patient.patientNumber).toMatch(/^SAN/)
    expect(patient.firstName).toBe('Ama')
    expect(patient.status).toBe('ACTIVE')
  })
})

describe('getPatientById', () => {
  test('ADMIN can look up any patient', async () => {
    const admin = await createUser('ADMIN')
    const patient = await createPatientFixture()
    const result = await getPatientById(patient.id, admin)
    expect(result.id).toBe(patient.id)
  })

  test('a DOCTOR with an encounter for this patient can look them up', async () => {
    const doctor = await createUser('DOCTOR')
    const patient = await createPatientFixture()
    await createEncounter(doctor.id, patient.id)

    const result = await getPatientById(patient.id, doctor)
    expect(result.id).toBe(patient.id)
  })

  test('a DOCTOR with no relationship to this patient gets a 404, not a 403', async () => {
    const doctor = await createUser('DOCTOR')
    const patient = await createPatientFixture()
    // No encounter created between them.
    await expect(getPatientById(patient.id, doctor)).rejects.toMatchObject({
      status: 404,
      code: 'PATIENT_NOT_FOUND',
    })
  })

  test('a VOIDED patient is treated as not found, even for ADMIN', async () => {
    const admin = await createUser('ADMIN')
    const patient = await createPatientFixture()
    await Patient.updateOne({ _id: patient.id }, { status: 'VOIDED' })

    await expect(getPatientById(patient.id, admin)).rejects.toMatchObject({ status: 404 })
  })
})

describe('updatePatient', () => {
  test('applies a partial update and returns the updated document', async () => {
    const patient = await createPatientFixture()
    const updated = await updatePatient(patient.id, { phone: '0551234567' })
    expect(updated.phone).toBe('0551234567')
    // Fields not in the update are left alone.
    expect(updated.firstName).toBe(patient.firstName)
  })

  test('404s for a patient id that does not exist', async () => {
    await expect(updatePatient('507f1f77bcf86cd799439011', { phone: '1' })).rejects.toMatchObject({
      status: 404,
    })
  })
})

describe('getPatientTimeline', () => {
  test('ADMIN (holds invoice.read) sees invoices, encounters, lab orders, and prescriptions', async () => {
    const admin = await createUser('ADMIN')
    const doctor = await createUser('DOCTOR')
    const patient = await createPatientFixture()
    const encounter = await createEncounter(doctor.id, patient.id)
    await createTestInvoice(patient.id, encounter.id)
    await createLabOrder(doctor.id, patient.id, encounter.id)
    await createPrescription(doctor.id, patient.id, encounter.id)

    const timeline = await getPatientTimeline(patient.id, admin)

    expect(timeline.encounters).toHaveLength(1)
    expect(timeline.labOrders).toHaveLength(1)
    expect(timeline.prescriptions).toHaveLength(1)
    expect(timeline.invoices).toHaveLength(1)
  })

  test('a DOCTOR (no invoice.read) sees everything except invoices', async () => {
    const doctor = await createUser('DOCTOR')
    const patient = await createPatientFixture()
    const encounter = await createEncounter(doctor.id, patient.id)
    await createTestInvoice(patient.id, encounter.id)

    const timeline = await getPatientTimeline(patient.id, doctor)

    expect(timeline.encounters).toHaveLength(1)
    expect(timeline.invoices).toEqual([])
  })

  test('a DOCTOR with no relationship to the patient is denied with a 404', async () => {
    const stranger = await createUser('DOCTOR')
    const patient = await createPatientFixture()
    await expect(getPatientTimeline(patient.id, stranger)).rejects.toMatchObject({
      status: 404,
      code: 'PATIENT_NOT_FOUND',
    })
  })
})

describe('getPatientForUser', () => {
  test('finds the Patient record linked to a login account', async () => {
    const patientUser = await createUser('PATIENT')
    const patient = await createPatientFixture()
    await Patient.updateOne({ _id: patient.id }, { user: patientUser.id })

    const result = await getPatientForUser(patientUser.id)
    expect(result?.id).toBe(patient.id)
  })

  test('returns null when no Patient record is linked to this user', async () => {
    const patientUser = await createUser('PATIENT')
    await expect(getPatientForUser(patientUser.id)).resolves.toBeNull()
  })
})

describe('searchPatients', () => {
  test('ADMIN sees every active patient, unrestricted', async () => {
    const admin = await createUser('ADMIN')
    await createPatientFixture()
    await createPatientFixture()

    const result = await searchPatients({}, admin)
    expect(result.total).toBe(2)
  })

  test('a DOCTOR only sees patients they have an encounter with', async () => {
    const doctor = await createUser('DOCTOR')
    const myPatient = await createPatientFixture()
    await createPatientFixture() // someone else's patient
    await createEncounter(doctor.id, myPatient.id)

    const result = await searchPatients({}, doctor)
    expect(result.total).toBe(1)
    expect(result.patients[0]?.id).toBe(myPatient.id)
  })

  test('a VOIDED patient never shows up in search results', async () => {
    const admin = await createUser('ADMIN')
    const patient = await createPatientFixture()
    await Patient.updateOne({ _id: patient.id }, { status: 'VOIDED' })

    const result = await searchPatients({}, admin)
    expect(result.total).toBe(0)
  })
})
