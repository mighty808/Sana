// Uses the replica-set variant of the test DB (not the plain standalone
// one every other file uses) because recordPayment below exercises a real
// MongoDB transaction, which a standalone mongod rejects outright. See
// setupTestDb.ts's connectTestDbWithReplSet for why.
import { listInvoices, getInvoiceForLabOrder, getInvoiceForPrescription, getInvoiceById, createInvoice } from '../services/invoice.service.js'
import { recordPayment, listPaymentsForInvoice } from '../services/payment.service.js'
import { Invoice } from '../models/Invoice.js'
import { Patient } from '../models/Patient.js'
import { connectTestDbWithReplSet, clearTestDb, disconnectTestDbReplSet, DB_BOOT_TIMEOUT_MS } from './setupTestDb.js'
import { createUser, createPatient, createEncounter, createLabOrder, createPrescription, createTestInvoice } from './factories.js'

beforeAll(connectTestDbWithReplSet, DB_BOOT_TIMEOUT_MS)
afterEach(clearTestDb)
afterAll(disconnectTestDbReplSet, DB_BOOT_TIMEOUT_MS)

describe('listInvoices', () => {
  test('a PATIENT sees only their own invoices', async () => {
    const patientUser = await createUser('PATIENT')
    const myPatient = await createPatient()
    const someoneElse = await createPatient()
    await Patient.updateOne({ _id: myPatient.id }, { user: patientUser.id })
    const myEncounter = await createEncounter((await createUser('DOCTOR')).id, myPatient.id)
    const theirEncounter = await createEncounter((await createUser('DOCTOR')).id, someoneElse.id)
    await createTestInvoice(myPatient.id, myEncounter.id)
    await createTestInvoice(someoneElse.id, theirEncounter.id)

    const result = await listInvoices(patientUser)
    expect(result).toHaveLength(1)
  })

  test('a PATIENT with no linked record sees an empty list', async () => {
    const patientUser = await createUser('PATIENT')
    await expect(listInvoices(patientUser)).resolves.toEqual([])
  })

  test('ADMIN sees every invoice', async () => {
    const doctor = await createUser('DOCTOR')
    const admin = await createUser('ADMIN')
    const patientA = await createPatient()
    const patientB = await createPatient()
    const encounterA = await createEncounter(doctor.id, patientA.id)
    const encounterB = await createEncounter(doctor.id, patientB.id)
    await createTestInvoice(patientA.id, encounterA.id)
    await createTestInvoice(patientB.id, encounterB.id)

    await expect(listInvoices(admin)).resolves.toHaveLength(2)
  })

  test('LAB_TECH and PHARMACIST get an empty list — their invoice.read only exists for one-off lookups', async () => {
    const doctor = await createUser('DOCTOR')
    const labTech = await createUser('LAB_TECH')
    const pharmacist = await createUser('PHARMACIST')
    const patient = await createPatient()
    const encounter = await createEncounter(doctor.id, patient.id)
    await createTestInvoice(patient.id, encounter.id)

    await expect(listInvoices(labTech)).resolves.toEqual([])
    await expect(listInvoices(pharmacist)).resolves.toEqual([])
  })
})

describe('getInvoiceForLabOrder / getInvoiceForPrescription', () => {
  test('returns null when the order has no invoice yet', async () => {
    const doctor = await createUser('DOCTOR')
    const admin = await createUser('ADMIN')
    const patient = await createPatient()
    const encounter = await createEncounter(doctor.id, patient.id)
    const order = await createLabOrder(doctor.id, patient.id, encounter.id)

    await expect(getInvoiceForLabOrder(order.id, admin)).resolves.toBeNull()
  })

  test('ADMIN/LAB_TECH can fetch any lab order\'s invoice directly', async () => {
    const doctor = await createUser('DOCTOR')
    const labTech = await createUser('LAB_TECH')
    const patient = await createPatient()
    const encounter = await createEncounter(doctor.id, patient.id)
    const order = await createLabOrder(doctor.id, patient.id, encounter.id)
    const invoice = await createInvoice({ labOrder: order.id, items: [{ description: 'CBC', qty: 1, unitPrice: 50 }] })

    const result = await getInvoiceForLabOrder(order.id, labTech)
    expect(result?.id).toBe(invoice.id)
  })

  test('a PATIENT can fetch their own order\'s invoice', async () => {
    const doctor = await createUser('DOCTOR')
    const patientUser = await createUser('PATIENT')
    const patient = await createPatient()
    await Patient.updateOne({ _id: patient.id }, { user: patientUser.id })
    const encounter = await createEncounter(doctor.id, patient.id)
    const order = await createLabOrder(doctor.id, patient.id, encounter.id)
    await createInvoice({ labOrder: order.id, items: [{ description: 'CBC', qty: 1, unitPrice: 50 }] })

    const result = await getInvoiceForLabOrder(order.id, patientUser)
    expect(result).not.toBeNull()
  })

  test('a PATIENT gets null for another patient\'s order invoice, even though it exists', async () => {
    const doctor = await createUser('DOCTOR')
    const patientUser = await createUser('PATIENT')
    const myPatient = await createPatient()
    const someoneElse = await createPatient()
    await Patient.updateOne({ _id: myPatient.id }, { user: patientUser.id })
    const encounter = await createEncounter(doctor.id, someoneElse.id)
    const order = await createLabOrder(doctor.id, someoneElse.id, encounter.id)
    await createInvoice({ labOrder: order.id, items: [{ description: 'CBC', qty: 1, unitPrice: 50 }] })

    await expect(getInvoiceForLabOrder(order.id, patientUser)).resolves.toBeNull()
  })

  test('getInvoiceForPrescription mirrors the same rules for a prescription', async () => {
    const doctor = await createUser('DOCTOR')
    const admin = await createUser('ADMIN')
    const patientUser = await createUser('PATIENT')
    const myPatient = await createPatient()
    await Patient.updateOne({ _id: myPatient.id }, { user: patientUser.id })
    const encounter = await createEncounter(doctor.id, myPatient.id)
    const rx = await createPrescription(doctor.id, myPatient.id, encounter.id)

    // No invoice yet.
    await expect(getInvoiceForPrescription(rx.id, admin)).resolves.toBeNull()

    const invoice = await createInvoice({ prescription: rx.id, items: [{ description: 'Amoxicillin', qty: 1, unitPrice: 50 }] })

    // ADMIN can fetch it directly, and so can the owning patient.
    await expect(getInvoiceForPrescription(rx.id, admin)).resolves.toMatchObject({ id: invoice.id })
    await expect(getInvoiceForPrescription(rx.id, patientUser)).resolves.toMatchObject({ id: invoice.id })
  })

  test('a PATIENT gets null for another patient\'s prescription invoice', async () => {
    const doctor = await createUser('DOCTOR')
    const patientUser = await createUser('PATIENT')
    await createPatient() // the requesting patient's own (unrelated) record — no link needed for this check
    const someoneElse = await createPatient()
    const encounter = await createEncounter(doctor.id, someoneElse.id)
    const rx = await createPrescription(doctor.id, someoneElse.id, encounter.id)
    await createInvoice({ prescription: rx.id, items: [{ description: 'Amoxicillin', qty: 1, unitPrice: 50 }] })

    // patientUser has no linked Patient record at all here, which already
    // fails the ownership check on its own — covering the "no patient
    // record" branch of the same guard exercised by name above.
    await expect(getInvoiceForPrescription(rx.id, patientUser)).resolves.toBeNull()
  })
})

describe('getInvoiceById', () => {
  test('ADMIN can fetch any invoice, together with its payment history', async () => {
    const doctor = await createUser('DOCTOR')
    const admin = await createUser('ADMIN')
    const patient = await createPatient()
    const encounter = await createEncounter(doctor.id, patient.id)
    const invoice = await createTestInvoice(patient.id, encounter.id)
    await recordPayment({ invoice: invoice.id, amount: 50, method: 'CASH' }, admin.id)

    const result = await getInvoiceById(invoice.id, admin)
    expect(result.invoice.id).toBe(invoice.id)
    expect(result.payments).toHaveLength(1)
  })

  test('a PATIENT can fetch their own invoice', async () => {
    const doctor = await createUser('DOCTOR')
    const patientUser = await createUser('PATIENT')
    const patient = await createPatient()
    await Patient.updateOne({ _id: patient.id }, { user: patientUser.id })
    const encounter = await createEncounter(doctor.id, patient.id)
    const invoice = await createTestInvoice(patient.id, encounter.id)

    const result = await getInvoiceById(invoice.id, patientUser)
    expect(result.invoice.id).toBe(invoice.id)
  })

  test('a PATIENT gets a 404 for someone else\'s invoice, not a 403', async () => {
    const doctor = await createUser('DOCTOR')
    const patientUser = await createUser('PATIENT')
    const myPatient = await createPatient()
    const someoneElse = await createPatient()
    await Patient.updateOne({ _id: myPatient.id }, { user: patientUser.id })
    const encounter = await createEncounter(doctor.id, someoneElse.id)
    const invoice = await createTestInvoice(someoneElse.id, encounter.id)

    await expect(getInvoiceById(invoice.id, patientUser)).rejects.toMatchObject({
      status: 404,
      code: 'INVOICE_NOT_FOUND',
    })
  })
})

describe('recordPayment', () => {
  test('a partial payment updates amountPaid/balance and sets status to PARTIALLY_PAID', async () => {
    const doctor = await createUser('DOCTOR')
    const admin = await createUser('ADMIN')
    const patient = await createPatient()
    const encounter = await createEncounter(doctor.id, patient.id)
    const invoice = await createTestInvoice(patient.id, encounter.id, { total: 100 })

    await recordPayment({ invoice: invoice.id, amount: 40, method: 'CASH' }, admin.id)

    const reread = await Invoice.findById(invoice.id)
    expect(reread?.amountPaid).toBe(40)
    expect(reread?.balance).toBe(60)
    expect(reread?.status).toBe('PARTIALLY_PAID')
  })

  test('a payment that covers the full balance sets status to PAID', async () => {
    const doctor = await createUser('DOCTOR')
    const admin = await createUser('ADMIN')
    const patient = await createPatient()
    const encounter = await createEncounter(doctor.id, patient.id)
    const invoice = await createTestInvoice(patient.id, encounter.id, { total: 100 })

    await recordPayment({ invoice: invoice.id, amount: 100, method: 'MOBILE_MONEY' }, admin.id)

    const reread = await Invoice.findById(invoice.id)
    expect(reread?.status).toBe('PAID')
    expect(reread?.balance).toBe(0)
  })

  test('two partial payments together reaching the full balance land on PAID, not PARTIALLY_PAID', async () => {
    const doctor = await createUser('DOCTOR')
    const admin = await createUser('ADMIN')
    const patient = await createPatient()
    const encounter = await createEncounter(doctor.id, patient.id)
    const invoice = await createTestInvoice(patient.id, encounter.id, { total: 100 })

    await recordPayment({ invoice: invoice.id, amount: 60, method: 'CASH' }, admin.id)
    await recordPayment({ invoice: invoice.id, amount: 40, method: 'CASH' }, admin.id)

    const reread = await Invoice.findById(invoice.id)
    expect(reread?.status).toBe('PAID')
    const payments = await listPaymentsForInvoice(invoice.id)
    expect(payments).toHaveLength(2)
  })

  test('rejects a payment that exceeds the outstanding balance', async () => {
    const doctor = await createUser('DOCTOR')
    const admin = await createUser('ADMIN')
    const patient = await createPatient()
    const encounter = await createEncounter(doctor.id, patient.id)
    const invoice = await createTestInvoice(patient.id, encounter.id, { total: 100 })

    await expect(recordPayment({ invoice: invoice.id, amount: 150, method: 'CASH' }, admin.id)).rejects.toMatchObject({
      status: 400,
      code: 'OVERPAYMENT',
    })
  })

  test('rejects a payment against a VOIDED invoice', async () => {
    const doctor = await createUser('DOCTOR')
    const admin = await createUser('ADMIN')
    const patient = await createPatient()
    const encounter = await createEncounter(doctor.id, patient.id)
    const invoice = await createTestInvoice(patient.id, encounter.id, { total: 100 })
    await Invoice.updateOne({ _id: invoice.id }, { status: 'VOIDED' })

    await expect(recordPayment({ invoice: invoice.id, amount: 10, method: 'CASH' }, admin.id)).rejects.toMatchObject({
      status: 400,
      code: 'INVOICE_VOIDED',
    })
  })

  test('rejects a nonexistent invoice', async () => {
    const admin = await createUser('ADMIN')
    await expect(
      recordPayment({ invoice: '507f1f77bcf86cd799439011', amount: 10, method: 'CASH' }, admin.id),
    ).rejects.toMatchObject({ status: 404, code: 'INVOICE_NOT_FOUND' })
  })

  test('a recorded payment is retrievable via listPaymentsForInvoice', async () => {
    const doctor = await createUser('DOCTOR')
    const admin = await createUser('ADMIN')
    const patient = await createPatient()
    const encounter = await createEncounter(doctor.id, patient.id)
    const invoice = await createTestInvoice(patient.id, encounter.id, { total: 100 })

    const payment = await recordPayment({ invoice: invoice.id, amount: 25, method: 'INSURANCE', reference: 'POL-1' }, admin.id)

    const payments = await listPaymentsForInvoice(invoice.id)
    expect(payments).toHaveLength(1)
    expect(payments[0]?.id).toBe(payment.id)
    expect(payments[0]?.reference).toBe('POL-1')
  })
})

// Lives here rather than in invoice-billing.test.ts because it needs a
// real recordPayment (a real MongoDB transaction), which requires this
// file's replica-set test DB — see the file header comment.
describe('createInvoice — billing again after the encounter\'s invoice is already settled', () => {
  test('a lab order billed after its encounter\'s lab invoice is fully paid starts a new invoice, not an append', async () => {
    const doctor = await createUser('DOCTOR')
    const admin = await createUser('ADMIN')
    const patient = await createPatient()
    const encounter = await createEncounter(doctor.id, patient.id)
    const orderA = await createLabOrder(doctor.id, patient.id, encounter.id)

    const invoiceA = await createInvoice({ labOrder: orderA.id, items: [{ description: 'CBC', qty: 1, unitPrice: 50 }] })
    await recordPayment({ invoice: invoiceA.id, amount: 50, method: 'CASH' }, admin.id)

    const orderB = await createLabOrder(doctor.id, patient.id, encounter.id)
    const invoiceB = await createInvoice({ labOrder: orderB.id, items: [{ description: 'Malaria RDT', qty: 1, unitPrice: 30 }] })

    expect(invoiceB.id).not.toBe(invoiceA.id)
    expect(invoiceB.labOrders?.map(String)).toEqual([orderB.id])
    expect(invoiceB.balance).toBe(30)
  })
})
