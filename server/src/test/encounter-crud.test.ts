import { createEncounter, addDiagnosis, updateDiagnosis, completeEncounter, getWardBoard } from '../services/encounter.service.js'
import { Appointment } from '../models/Appointment.js'
import { connectTestDb, clearTestDb, disconnectTestDb, DB_BOOT_TIMEOUT_MS } from './setupTestDb.js'
import { createUser, createPatient, createAppointment, createEncounter as createEncounterFixture, createAiConsultation } from './factories.js'

beforeAll(connectTestDb, DB_BOOT_TIMEOUT_MS)
afterEach(clearTestDb)
afterAll(disconnectTestDb, DB_BOOT_TIMEOUT_MS)

describe('createEncounter', () => {
  test('derives the doctor from the appointment and links the appointment back to it', async () => {
    const doctor = await createUser('DOCTOR')
    const patient = await createPatient()
    const appt = await createAppointment(doctor.id, patient.id)

    const encounter = await createEncounter({
      patient: patient.id,
      appointment: appt.id,
      chiefComplaint: 'Fever and cough',
    })

    expect(encounter.doctor.toString()).toBe(doctor.id)
    expect(encounter.status).toBe('IN_PROGRESS')
    const reReadAppt = await Appointment.findById(appt.id)
    expect(reReadAppt?.encounter?.toString()).toBe(encounter.id)
  })

  test('rejects a nonexistent patient', async () => {
    const doctor = await createUser('DOCTOR')
    const patient = await createPatient()
    const appt = await createAppointment(doctor.id, patient.id)

    await expect(
      createEncounter({ patient: '507f1f77bcf86cd799439011', appointment: appt.id, chiefComplaint: 'x' }),
    ).rejects.toMatchObject({ status: 404, code: 'PATIENT_NOT_FOUND' })
  })

  test('rejects a nonexistent appointment', async () => {
    const patient = await createPatient()
    await expect(
      createEncounter({ patient: patient.id, appointment: '507f1f77bcf86cd799439011', chiefComplaint: 'x' }),
    ).rejects.toMatchObject({ status: 404, code: 'APPOINTMENT_NOT_FOUND' })
  })
})

describe('addDiagnosis / updateDiagnosis', () => {
  test('the assigned doctor can add a diagnosis', async () => {
    const doctor = await createUser('DOCTOR')
    const patient = await createPatient()
    const encounter = await createEncounterFixture(doctor.id, patient.id)

    const dx = await addDiagnosis(encounter.id, doctor.id, { diagnosis: 'Malaria' })
    expect(dx.diagnosis).toBe('Malaria')
    expect(dx.patient.toString()).toBe(patient.id)
  })

  test('a different doctor cannot add a diagnosis — reported as 404', async () => {
    const owner = await createUser('DOCTOR')
    const stranger = await createUser('DOCTOR')
    const patient = await createPatient()
    const encounter = await createEncounterFixture(owner.id, patient.id)

    await expect(addDiagnosis(encounter.id, stranger.id, { diagnosis: 'Malaria' })).rejects.toMatchObject({
      status: 404,
      code: 'ENCOUNTER_NOT_FOUND',
    })
  })

  test('cannot add a diagnosis to a COMPLETED encounter', async () => {
    const doctor = await createUser('DOCTOR')
    const patient = await createPatient()
    const encounter = await createEncounterFixture(doctor.id, patient.id, { status: 'COMPLETED' })

    await expect(addDiagnosis(encounter.id, doctor.id, { diagnosis: 'Malaria' })).rejects.toMatchObject({
      status: 409,
      code: 'ENCOUNTER_COMPLETED',
    })
  })

  test('the assigned doctor can correct an existing diagnosis', async () => {
    const doctor = await createUser('DOCTOR')
    const patient = await createPatient()
    const encounter = await createEncounterFixture(doctor.id, patient.id)
    const dx = await addDiagnosis(encounter.id, doctor.id, { diagnosis: 'Malaria' })

    const updated = await updateDiagnosis(encounter.id, dx.id, doctor.id, { diagnosis: 'Typhoid' })
    expect(updated.diagnosis).toBe('Typhoid')
  })

  test('a different doctor cannot correct a diagnosis they don\'t own', async () => {
    const owner = await createUser('DOCTOR')
    const stranger = await createUser('DOCTOR')
    const patient = await createPatient()
    const encounter = await createEncounterFixture(owner.id, patient.id)
    const dx = await addDiagnosis(encounter.id, owner.id, { diagnosis: 'Malaria' })

    await expect(updateDiagnosis(encounter.id, dx.id, stranger.id, { diagnosis: 'Typhoid' })).rejects.toMatchObject({
      status: 404,
    })
  })
})

describe('completeEncounter', () => {
  test('the assigned doctor can complete their own encounter', async () => {
    const doctor = await createUser('DOCTOR')
    const patient = await createPatient()
    const encounter = await createEncounterFixture(doctor.id, patient.id)

    const completed = await completeEncounter(encounter.id, doctor.id)
    expect(completed.status).toBe('COMPLETED')
    expect(completed.completedAt).toBeInstanceOf(Date)
  })

  test('a different doctor cannot complete someone else\'s encounter', async () => {
    const owner = await createUser('DOCTOR')
    const stranger = await createUser('DOCTOR')
    const patient = await createPatient()
    const encounter = await createEncounterFixture(owner.id, patient.id)

    await expect(completeEncounter(encounter.id, stranger.id)).rejects.toMatchObject({
      status: 404,
      code: 'ENCOUNTER_NOT_FOUND',
    })
  })

  test('completing an already-completed encounter is rejected', async () => {
    const doctor = await createUser('DOCTOR')
    const patient = await createPatient()
    const encounter = await createEncounterFixture(doctor.id, patient.id, { status: 'COMPLETED' })

    await expect(completeEncounter(encounter.id, doctor.id)).rejects.toMatchObject({
      status: 409,
      code: 'ALREADY_COMPLETED',
    })
  })
})

describe('getWardBoard', () => {
  test('only shows IN_PROGRESS encounters, never COMPLETED ones', async () => {
    const doctor = await createUser('DOCTOR')
    const patient = await createPatient()
    await createEncounterFixture(doctor.id, patient.id, { status: 'IN_PROGRESS' })
    await createEncounterFixture(doctor.id, patient.id, { status: 'COMPLETED' })

    const board = await getWardBoard(doctor)
    expect(board).toHaveLength(1)
  })

  test('a DOCTOR only sees their own open encounters', async () => {
    const doctorA = await createUser('DOCTOR')
    const doctorB = await createUser('DOCTOR')
    const patient = await createPatient()
    await createEncounterFixture(doctorA.id, patient.id)
    await createEncounterFixture(doctorB.id, patient.id)

    const board = await getWardBoard(doctorA)
    expect(board).toHaveLength(1)
  })

  test('ADMIN and NURSE see every open encounter', async () => {
    const doctorA = await createUser('DOCTOR')
    const doctorB = await createUser('DOCTOR')
    const admin = await createUser('ADMIN')
    const nurse = await createUser('NURSE')
    const patient = await createPatient()
    await createEncounterFixture(doctorA.id, patient.id)
    await createEncounterFixture(doctorB.id, patient.id)

    await expect(getWardBoard(admin)).resolves.toHaveLength(2)
    await expect(getWardBoard(nurse)).resolves.toHaveLength(2)
  })

  test('carries the latest acuity read for an encounter that has one', async () => {
    const doctor = await createUser('DOCTOR')
    const patient = await createPatient()
    const encounter = await createEncounterFixture(doctor.id, patient.id)
    await createAiConsultation(encounter.id, doctor.id, patient.id, { acuityLevel: 'CRITICAL', acuityReasons: ['low SpO2'] })

    const board = await getWardBoard(doctor)
    expect(board).toHaveLength(1)
    expect(board[0]?.acuityLevel).toBe('CRITICAL')
  })

  test('an encounter with no acuity read yet has acuityLevel undefined, not an error', async () => {
    const doctor = await createUser('DOCTOR')
    const patient = await createPatient()
    await createEncounterFixture(doctor.id, patient.id)

    const board = await getWardBoard(doctor)
    expect(board[0]?.acuityLevel).toBeUndefined()
  })
})
