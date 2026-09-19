import { createPrescription, listPrescriptions, dispensePrescription } from '../services/prescription.service.js'
import { Notification } from '../models/Notification.js'
import { Patient } from '../models/Patient.js'
import { refToIdString } from '../utils/populate.js'
import { connectTestDb, clearTestDb, disconnectTestDb, DB_BOOT_TIMEOUT_MS } from './setupTestDb.js'
import { createUser, createPatient, createEncounter, createPrescription as createPrescriptionFixture } from './factories.js'

beforeAll(connectTestDb, DB_BOOT_TIMEOUT_MS)
afterEach(clearTestDb)
afterAll(disconnectTestDb, DB_BOOT_TIMEOUT_MS)

const MEDS = [{ drugName: 'Amoxicillin', dosage: '500mg', frequency: '3x daily', duration: '7 days' }]

describe('createPrescription', () => {
  test('the assigned doctor can write a prescription on their own open encounter', async () => {
    const doctor = await createUser('DOCTOR')
    const patient = await createPatient()
    const encounter = await createEncounter(doctor.id, patient.id)

    const rx = await createPrescription(encounter.id, doctor.id, MEDS)

    expect(rx.prescriptionNumber).toMatch(/^RX/)
    expect(refToIdString(rx.patient)).toBe(patient.id)
    expect(rx.status).toBe('PRESCRIBED')
  })

  test('a different doctor cannot write on someone else\'s encounter', async () => {
    const owner = await createUser('DOCTOR')
    const stranger = await createUser('DOCTOR')
    const patient = await createPatient()
    const encounter = await createEncounter(owner.id, patient.id)

    await expect(createPrescription(encounter.id, stranger.id, MEDS)).rejects.toMatchObject({
      status: 404,
      code: 'ENCOUNTER_NOT_FOUND',
    })
  })

  test('cannot write a prescription on a COMPLETED encounter', async () => {
    const doctor = await createUser('DOCTOR')
    const patient = await createPatient()
    const encounter = await createEncounter(doctor.id, patient.id, { status: 'COMPLETED' })

    await expect(createPrescription(encounter.id, doctor.id, MEDS)).rejects.toMatchObject({
      status: 409,
      code: 'ENCOUNTER_COMPLETED',
    })
  })
})

describe('listPrescriptions', () => {
  test('a PATIENT sees only their own prescriptions', async () => {
    const doctor = await createUser('DOCTOR')
    const patientUser = await createUser('PATIENT')
    const myPatient = await createPatient()
    const someoneElse = await createPatient()
    await Patient.updateOne({ _id: myPatient.id }, { user: patientUser.id })
    const myEncounter = await createEncounter(doctor.id, myPatient.id)
    const theirEncounter = await createEncounter(doctor.id, someoneElse.id)
    await createPrescriptionFixture(doctor.id, myPatient.id, myEncounter.id)
    await createPrescriptionFixture(doctor.id, someoneElse.id, theirEncounter.id)

    const result = await listPrescriptions(patientUser)
    expect(result).toHaveLength(1)
  })

  test('a PATIENT with no linked record sees an empty list', async () => {
    const patientUser = await createUser('PATIENT')
    await expect(listPrescriptions(patientUser)).resolves.toEqual([])
  })

  test('a DOCTOR sees only the prescriptions they personally wrote', async () => {
    const doctorA = await createUser('DOCTOR')
    const doctorB = await createUser('DOCTOR')
    const patient = await createPatient()
    const encounterA = await createEncounter(doctorA.id, patient.id)
    const encounterB = await createEncounter(doctorB.id, patient.id)
    await createPrescriptionFixture(doctorA.id, patient.id, encounterA.id)
    await createPrescriptionFixture(doctorB.id, patient.id, encounterB.id)

    const result = await listPrescriptions(doctorA)
    expect(result).toHaveLength(1)
  })

  test('ADMIN and PHARMACIST see every prescription', async () => {
    const doctorA = await createUser('DOCTOR')
    const doctorB = await createUser('DOCTOR')
    const admin = await createUser('ADMIN')
    const pharmacist = await createUser('PHARMACIST')
    const patient = await createPatient()
    const encounterA = await createEncounter(doctorA.id, patient.id)
    const encounterB = await createEncounter(doctorB.id, patient.id)
    await createPrescriptionFixture(doctorA.id, patient.id, encounterA.id)
    await createPrescriptionFixture(doctorB.id, patient.id, encounterB.id)

    await expect(listPrescriptions(admin)).resolves.toHaveLength(2)
    await expect(listPrescriptions(pharmacist)).resolves.toHaveLength(2)
  })

  test('a statusFilter narrows the results', async () => {
    const doctor = await createUser('DOCTOR')
    const pharmacist = await createUser('PHARMACIST')
    const patient = await createPatient()
    const encounter = await createEncounter(doctor.id, patient.id)
    const rx = await createPrescriptionFixture(doctor.id, patient.id, encounter.id)
    await dispensePrescription(rx.id, pharmacist.id)
    await createPrescriptionFixture(doctor.id, patient.id, encounter.id) // stays PRESCRIBED

    const dispensedOnly = await listPrescriptions(pharmacist, 'DISPENSED')
    expect(dispensedOnly).toHaveLength(1)
  })
})

describe('dispensePrescription', () => {
  test('marks it DISPENSED and notifies the prescribing doctor', async () => {
    const doctor = await createUser('DOCTOR')
    const pharmacist = await createUser('PHARMACIST')
    const patient = await createPatient()
    const encounter = await createEncounter(doctor.id, patient.id)
    const rx = await createPrescriptionFixture(doctor.id, patient.id, encounter.id)

    const dispensed = await dispensePrescription(rx.id, pharmacist.id)

    expect(dispensed.status).toBe('DISPENSED')
    expect(dispensed.dispensedAt).toBeInstanceOf(Date)
    expect(refToIdString(dispensed.dispensedBy)).toBe(pharmacist.id)
    const notification = await Notification.findOne({ user: doctor.id, entityId: rx.id })
    expect(notification?.type).toBe('prescription.dispensed')
  })

  test('rejects dispensing an already-dispensed prescription', async () => {
    const doctor = await createUser('DOCTOR')
    const pharmacist = await createUser('PHARMACIST')
    const patient = await createPatient()
    const encounter = await createEncounter(doctor.id, patient.id)
    const rx = await createPrescriptionFixture(doctor.id, patient.id, encounter.id)
    await dispensePrescription(rx.id, pharmacist.id)

    await expect(dispensePrescription(rx.id, pharmacist.id)).rejects.toMatchObject({
      status: 409,
      code: 'PRESCRIPTION_NOT_DISPENSABLE',
    })
  })

  test('rejects a nonexistent prescription id with the same error', async () => {
    const pharmacist = await createUser('PHARMACIST')
    await expect(dispensePrescription('507f1f77bcf86cd799439011', pharmacist.id)).rejects.toMatchObject({
      status: 409,
      code: 'PRESCRIPTION_NOT_DISPENSABLE',
    })
  })
})
