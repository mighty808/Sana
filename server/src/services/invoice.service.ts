import { Invoice } from '../models/Invoice.js'
import { Encounter } from '../models/Encounter.js'
import { Patient } from '../models/Patient.js'
import { generateId } from '../utils/generateId.js'
import { AppError, assertValidObjectId } from '../utils/apiResponse.js'
import type { AuthedUser } from '../types/user.js'
import { listPaymentsForInvoice } from './payment.service.js'

interface InvoiceItemInput {
  description: string
  qty: number
  unitPrice: number
}

interface CreateInvoiceInput {
  encounter: string
  items: InvoiceItemInput[]
}

// Generates an invoice from a completed encounter. `patient` is derived
// from the encounter (not caller-supplied) — same reasoning as
// labOrder.service.ts's createLabOrder: a bill always belongs to whichever
// patient the encounter is for.
//
// Each item's `amount` is computed here as qty * unitPrice — never trusted
// from the request body — so a caller can't submit a line item whose
// amount doesn't actually match its own qty/unitPrice and quietly skew the total.
export async function createInvoice(input: CreateInvoiceInput) {
  assertValidObjectId(input.encounter, 'encounter')

  const encounter = await Encounter.findById(input.encounter)
  if (!encounter) throw new AppError('Encounter not found', 404, 'ENCOUNTER_NOT_FOUND')

  // One (non-voided) invoice per encounter — prevents accidentally
  // double-billing the same visit. A VOIDED invoice doesn't count, so a
  // corrected/replacement invoice can still be generated for that encounter.
  const existing = await Invoice.findOne({ encounter: input.encounter, status: { $ne: 'VOIDED' } })
  if (existing) {
    throw new AppError(
      `Encounter already has an invoice (${existing.invoiceNumber})`,
      409,
      'INVOICE_ALREADY_EXISTS',
    )
  }

  const items = input.items.map((item) => ({
    ...item,
    amount: item.qty * item.unitPrice,
  }))
  const subtotal = items.reduce((sum, item) => sum + item.amount, 0)

  const invoiceNumber = await generateId('INV')
  return Invoice.create({
    invoiceNumber,
    patient: encounter.patient,
    encounter: input.encounter,
    items,
    subtotal,
    // No tax/discount logic in this MVP (see the field's comment on
    // models/Invoice.ts) — total starts out equal to subtotal.
    total: subtotal,
    amountPaid: 0,
    balance: subtotal,
  })
}

// Lists invoices. Only ADMIN and PATIENT hold 'invoice.read' at all (see
// types/permissions.ts — Doctor/Nurse have no billing visibility in this
// MVP, matching the blueprint's role table). ADMIN sees everything, since
// they're the one managing billing; PATIENT is hard-restricted to their own
// invoices — like lab-result release-gating in Phase 5, this is a direct
// enforcement of "Patient: view own ... invoices," not a "nice to have" scoping choice.
export async function listInvoices(user: AuthedUser) {
  if (user.role.name === 'PATIENT') {
    const patient = await Patient.findOne({ user: user.id })
    if (!patient) return []
    return Invoice.find({ patient: patient.id }).sort({ createdAt: -1 })
  }

  // ADMIN.
  return Invoice.find().populate('patient').sort({ createdAt: -1 })
}

// Fetches one invoice with its payment history. For PATIENT, this is
// hard-scoped to their own invoice (not the "broad by permission" precedent
// from Phase 4/5's single-resource GETs) — for the same reason listInvoices
// above hard-restricts them: invoice access for a patient is a blueprint
// requirement, not a staff-convenience default.
export async function getInvoiceById(id: string, user: AuthedUser) {
  const invoice = await Invoice.findById(id).populate('patient')
  if (!invoice) throw new AppError('Invoice not found', 404, 'INVOICE_NOT_FOUND')

  if (user.role.name === 'PATIENT') {
    const patient = await Patient.findOne({ user: user.id })
    // `.populate('patient')` above replaces the raw ObjectId with a full
    // Patient document at runtime, but Mongoose's static types don't
    // reflect that (same reasoning as the identical cast pattern in
    // auth.service.ts) — hence the cast to read `.id` off it here.
    const invoicePatientId = (invoice.patient as unknown as { id: string }).id
    if (!patient || invoicePatientId !== patient.id) {
      // Same invoice, wrong patient — report 404 rather than 403 so a
      // patient can't use this endpoint to probe which invoice ids exist.
      throw new AppError('Invoice not found', 404, 'INVOICE_NOT_FOUND')
    }
  }

  const payments = await listPaymentsForInvoice(id)
  return { invoice, payments }
}
