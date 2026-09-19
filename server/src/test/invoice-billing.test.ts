// Regression coverage for invoice.service.ts's createInvoice — specifically
// the null-collision trap that was reasoned about (and fixed) this session:
// making Invoice.labOrder optional to support prescription billing could
// have broken its partial unique index, since MongoDB treats every
// document missing an indexed field as colliding on the same `null` unless
// the partial filter explicitly requires that field to exist. This was
// previously verified only by hand-reasoning plus a throwaway script
// against the real database.
import { createInvoice } from '../services/invoice.service.js'
import { LabOrder } from '../models/LabOrder.js'
import { Prescription } from '../models/Prescription.js'
import { AppError } from '../utils/apiResponse.js'
import { connectTestDb, clearTestDb, disconnectTestDb, DB_BOOT_TIMEOUT_MS } from './setupTestDb.js'
import { createUser, createPatient, createEncounter } from './factories.js'

beforeAll(connectTestDb, DB_BOOT_TIMEOUT_MS)
afterEach(clearTestDb)
afterAll(disconnectTestDb, DB_BOOT_TIMEOUT_MS)

async function createTestLabOrder(doctorId: string, patientId: string, encounterId: string) {
  return LabOrder.create({
    labOrderNumber: `LAB-TEST-${Date.now()}-${Math.random()}`,
    encounter: encounterId,
    patient: patientId,
    doctor: doctorId,
    tests: [{ testName: 'CBC' }],
  })
}

async function createTestPrescription(doctorId: string, patientId: string, encounterId: string) {
  return Prescription.create({
    prescriptionNumber: `RX-TEST-${Date.now()}-${Math.random()}`,
    encounter: encounterId,
    patient: patientId,
    doctor: doctorId,
    medications: [{ drugName: 'Amoxicillin', dosage: '500mg', frequency: '3x daily', duration: '7 days' }],
  })
}

describe('createInvoice', () => {
  test('bills a lab order and computes amount/subtotal/total from qty*unitPrice', async () => {
    const doctor = await createUser('DOCTOR')
    const patient = await createPatient()
    const encounter = await createEncounter(doctor.id, patient.id)
    const order = await createTestLabOrder(doctor.id, patient.id, encounter.id)

    const invoice = await createInvoice({
      labOrder: order.id,
      items: [{ description: 'CBC', qty: 1, unitPrice: 50 }],
    })

    expect(invoice.labOrder?.toString()).toBe(order.id)
    expect(invoice.prescription).toBeUndefined()
    expect(invoice.subtotal).toBe(50)
    expect(invoice.total).toBe(50)
    expect(invoice.balance).toBe(50)
    expect(invoice.patient.toString()).toBe(patient.id)
  })

  test('bills a prescription the same way', async () => {
    const doctor = await createUser('DOCTOR')
    const patient = await createPatient()
    const encounter = await createEncounter(doctor.id, patient.id)
    const rx = await createTestPrescription(doctor.id, patient.id, encounter.id)

    const invoice = await createInvoice({
      prescription: rx.id,
      items: [{ description: 'Amoxicillin (500mg)', qty: 2, unitPrice: 50 }],
    })

    expect(invoice.prescription?.toString()).toBe(rx.id)
    expect(invoice.labOrder).toBeUndefined()
    expect(invoice.subtotal).toBe(100)
  })

  test('rejects a request with neither labOrder nor prescription', async () => {
    await expect(createInvoice({ items: [{ description: 'x', qty: 1, unitPrice: 1 }] })).rejects.toMatchObject({
      status: 400,
      code: 'INVALID_INVOICE_SOURCE',
    } satisfies Partial<AppError>)
  })

  test('rejects a request with BOTH labOrder and prescription', async () => {
    const doctor = await createUser('DOCTOR')
    const patient = await createPatient()
    const encounter = await createEncounter(doctor.id, patient.id)
    const order = await createTestLabOrder(doctor.id, patient.id, encounter.id)
    const rx = await createTestPrescription(doctor.id, patient.id, encounter.id)

    await expect(
      createInvoice({ labOrder: order.id, prescription: rx.id, items: [{ description: 'x', qty: 1, unitPrice: 1 }] }),
    ).rejects.toMatchObject({ status: 400, code: 'INVALID_INVOICE_SOURCE' })
  })

  test('refuses to double-bill the same lab order', async () => {
    const doctor = await createUser('DOCTOR')
    const patient = await createPatient()
    const encounter = await createEncounter(doctor.id, patient.id)
    const order = await createTestLabOrder(doctor.id, patient.id, encounter.id)

    await createInvoice({ labOrder: order.id, items: [{ description: 'CBC', qty: 1, unitPrice: 50 }] })

    await expect(
      createInvoice({ labOrder: order.id, items: [{ description: 'CBC', qty: 1, unitPrice: 50 }] }),
    ).rejects.toMatchObject({ status: 409, code: 'INVOICE_ALREADY_EXISTS' })
  })

  test('refuses to double-bill the same prescription', async () => {
    const doctor = await createUser('DOCTOR')
    const patient = await createPatient()
    const encounter = await createEncounter(doctor.id, patient.id)
    const rx = await createTestPrescription(doctor.id, patient.id, encounter.id)

    await createInvoice({ prescription: rx.id, items: [{ description: 'Amoxicillin', qty: 1, unitPrice: 50 }] })

    await expect(
      createInvoice({ prescription: rx.id, items: [{ description: 'Amoxicillin', qty: 1, unitPrice: 50 }] }),
    ).rejects.toMatchObject({ status: 409, code: 'INVOICE_ALREADY_EXISTS' })
  })

  // This is the null-collision trap itself, proven directly rather than by
  // reasoning about the index definition: if the partial unique index on
  // `prescription` didn't require the field to `$exist`, then a
  // lab-order-only invoice (which has no `prescription` field at all)
  // would collide with a prescription-only invoice on the shared `null`,
  // and the SECOND invoice created below would wrongly fail with a
  // duplicate-key error even though they bill two completely different
  // things.
  test('billing a lab order does not collide with billing a prescription (the null-collision trap)', async () => {
    const doctor = await createUser('DOCTOR')
    const patient = await createPatient()
    const encounter = await createEncounter(doctor.id, patient.id)
    const order = await createTestLabOrder(doctor.id, patient.id, encounter.id)
    const rx = await createTestPrescription(doctor.id, patient.id, encounter.id)

    const invoiceForOrder = await createInvoice({ labOrder: order.id, items: [{ description: 'CBC', qty: 1, unitPrice: 50 }] })
    const invoiceForRx = await createInvoice({
      prescription: rx.id,
      items: [{ description: 'Amoxicillin', qty: 1, unitPrice: 50 }],
    })

    expect(invoiceForOrder.id).not.toBe(invoiceForRx.id)
  })

  test('a second lab order for the same patient can still be billed independently', async () => {
    const doctor = await createUser('DOCTOR')
    const patient = await createPatient()
    const encounter = await createEncounter(doctor.id, patient.id)
    const orderA = await createTestLabOrder(doctor.id, patient.id, encounter.id)
    const orderB = await createTestLabOrder(doctor.id, patient.id, encounter.id)

    const invoiceA = await createInvoice({ labOrder: orderA.id, items: [{ description: 'CBC', qty: 1, unitPrice: 50 }] })
    const invoiceB = await createInvoice({ labOrder: orderB.id, items: [{ description: 'CBC', qty: 1, unitPrice: 50 }] })

    expect(invoiceA.id).not.toBe(invoiceB.id)
  })
})
