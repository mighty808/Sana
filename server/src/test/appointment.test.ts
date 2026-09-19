import { createAppointment, listAppointments, updateAppointmentStatus } from '../services/appointment.service.js'
import { Notification } from '../models/Notification.js'
import { Patient } from '../models/Patient.js'
import { connectTestDb, clearTestDb, disconnectTestDb, DB_BOOT_TIMEOUT_MS } from './setupTestDb.js'
import { createUser, createPatient, createAppointment as createAppointmentFixture } from './factories.js'

beforeAll(connectTestDb, DB_BOOT_TIMEOUT_MS)
afterEach(clearTestDb)
afterAll(disconnectTestDb, DB_BOOT_TIMEOUT_MS)

describe('createAppointment', () => {
  test('books a valid appointment and notifies the assigned doctor', async () => {
    const doctor = await createUser('DOCTOR')
    const patient = await createPatient()

    const appt = await createAppointment({
      patient: patient.id,
      doctor: doctor.id,
      date: new Date('2027-02-01'),
      startTime: '09:00',
      endTime: '09:30',
    })

    expect(appt.appointmentNumber).toMatch(/^APT/)
    const notification = await Notification.findOne({ user: doctor.id, entityId: appt.id })
    expect(notification?.entityType).toBe('Appointment')
  })

  test('rejects a nonexistent patient', async () => {
    const doctor = await createUser('DOCTOR')
    await expect(
      createAppointment({
        patient: '507f1f77bcf86cd799439011',
        doctor: doctor.id,
        date: new Date('2027-02-01'),
        startTime: '09:00',
        endTime: '09:30',
      }),
    ).rejects.toMatchObject({ status: 404, code: 'PATIENT_NOT_FOUND' })
  })

  test('rejects a nonexistent doctor', async () => {
    const patient = await createPatient()
    await expect(
      createAppointment({
        patient: patient.id,
        doctor: '507f1f77bcf86cd799439011',
        date: new Date('2027-02-01'),
        startTime: '09:00',
        endTime: '09:30',
      }),
    ).rejects.toMatchObject({ status: 404, code: 'DOCTOR_NOT_FOUND' })
  })

  test('rejects a "doctor" id that is actually some other role', async () => {
    const nurse = await createUser('NURSE')
    const patient = await createPatient()
    await expect(
      createAppointment({
        patient: patient.id,
        doctor: nurse.id,
        date: new Date('2027-02-01'),
        startTime: '09:00',
        endTime: '09:30',
      }),
    ).rejects.toMatchObject({ status: 400, code: 'NOT_A_DOCTOR' })
  })

  test('rejects an overlapping booking for the same doctor on the same day', async () => {
    const doctor = await createUser('DOCTOR')
    const patientA = await createPatient()
    const patientB = await createPatient()
    await createAppointmentFixture(doctor.id, patientA.id, {
      date: new Date('2027-02-01'),
      startTime: '09:00',
      endTime: '09:30',
    })

    await expect(
      createAppointment({
        patient: patientB.id,
        doctor: doctor.id,
        date: new Date('2027-02-01'),
        startTime: '09:15', // overlaps the 09:00-09:30 slot
        endTime: '09:45',
      }),
    ).rejects.toMatchObject({ status: 409, code: 'APPOINTMENT_CONFLICT' })
  })

  test('allows a back-to-back booking that does not actually overlap', async () => {
    const doctor = await createUser('DOCTOR')
    const patientA = await createPatient()
    const patientB = await createPatient()
    await createAppointmentFixture(doctor.id, patientA.id, {
      date: new Date('2027-02-01'),
      startTime: '09:00',
      endTime: '09:30',
    })

    const second = await createAppointment({
      patient: patientB.id,
      doctor: doctor.id,
      date: new Date('2027-02-01'),
      startTime: '09:30', // starts exactly when the first ends
      endTime: '10:00',
    })
    expect(second.startTime).toBe('09:30')
  })

  test('a CANCELLED appointment does not block re-booking the same slot', async () => {
    const doctor = await createUser('DOCTOR')
    const patientA = await createPatient()
    const patientB = await createPatient()
    await createAppointmentFixture(doctor.id, patientA.id, {
      date: new Date('2027-02-01'),
      startTime: '09:00',
      endTime: '09:30',
      status: 'CANCELLED',
    })

    const second = await createAppointment({
      patient: patientB.id,
      doctor: doctor.id,
      date: new Date('2027-02-01'),
      startTime: '09:00',
      endTime: '09:30',
    })
    expect(second.startTime).toBe('09:00')
  })
})

describe('listAppointments', () => {
  test('a DOCTOR only sees their own appointments', async () => {
    const doctorA = await createUser('DOCTOR')
    const doctorB = await createUser('DOCTOR')
    const patient = await createPatient()
    await createAppointmentFixture(doctorA.id, patient.id)
    await createAppointmentFixture(doctorB.id, patient.id)

    const result = await listAppointments(doctorA)
    expect(result).toHaveLength(1)
  })

  test('ADMIN and NURSE see every appointment', async () => {
    const doctorA = await createUser('DOCTOR')
    const doctorB = await createUser('DOCTOR')
    const admin = await createUser('ADMIN')
    const nurse = await createUser('NURSE')
    const patient = await createPatient()
    await createAppointmentFixture(doctorA.id, patient.id)
    await createAppointmentFixture(doctorB.id, patient.id)

    await expect(listAppointments(admin)).resolves.toHaveLength(2)
    await expect(listAppointments(nurse)).resolves.toHaveLength(2)
  })

  test('a PATIENT sees only their own linked appointments', async () => {
    const doctor = await createUser('DOCTOR')
    const patientUser = await createUser('PATIENT')
    const myPatientRecord = await createPatient()
    const someoneElse = await createPatient()
    await Patient.updateOne({ _id: myPatientRecord.id }, { user: patientUser.id })
    await createAppointmentFixture(doctor.id, myPatientRecord.id)
    await createAppointmentFixture(doctor.id, someoneElse.id)

    const result = await listAppointments(patientUser)
    expect(result).toHaveLength(1)
  })

  test('a PATIENT with no linked Patient record sees an empty list, not an error', async () => {
    const patientUser = await createUser('PATIENT')
    await expect(listAppointments(patientUser)).resolves.toEqual([])
  })
})

describe('updateAppointmentStatus', () => {
  test('ADMIN can update any appointment', async () => {
    const doctor = await createUser('DOCTOR')
    const admin = await createUser('ADMIN')
    const patient = await createPatient()
    const appt = await createAppointmentFixture(doctor.id, patient.id)

    const updated = await updateAppointmentStatus(appt.id, 'CHECKED_IN', admin)
    expect(updated.status).toBe('CHECKED_IN')
  })

  test('a DOCTOR can update their own appointment', async () => {
    const doctor = await createUser('DOCTOR')
    const patient = await createPatient()
    const appt = await createAppointmentFixture(doctor.id, patient.id)

    const updated = await updateAppointmentStatus(appt.id, 'COMPLETED', doctor)
    expect(updated.status).toBe('COMPLETED')
  })

  test('a DOCTOR cannot update another doctor\'s appointment — reported as 404', async () => {
    const owner = await createUser('DOCTOR')
    const stranger = await createUser('DOCTOR')
    const patient = await createPatient()
    const appt = await createAppointmentFixture(owner.id, patient.id)

    await expect(updateAppointmentStatus(appt.id, 'CANCELLED', stranger)).rejects.toMatchObject({
      status: 404,
      code: 'APPOINTMENT_NOT_FOUND',
    })
  })
})
