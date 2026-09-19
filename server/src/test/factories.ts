import { Role } from '../models/Role.js'
import { User } from '../models/User.js'
import { Patient } from '../models/Patient.js'
import { Encounter } from '../models/Encounter.js'
import { Appointment, type AppointmentStatus } from '../models/Appointment.js'
import { Referral } from '../models/Referral.js'
import { LabOrder } from '../models/LabOrder.js'
import { Prescription } from '../models/Prescription.js'
import { AiConsultation, type AiConsultationSource } from '../models/AiConsultation.js'
import { Invoice } from '../models/Invoice.js'
import { Payment, type PaymentMethod } from '../models/Payment.js'
import { Notification } from '../models/Notification.js'
import { AuditLog } from '../models/AuditLog.js'
import { hashPassword } from '../services/auth.service.js'
import { DEFAULT_ROLE_PERMISSIONS, type RoleName, type Permission } from '../types/permissions.js'
import type { AuthedUser } from '../types/user.js'

let counter = 0
// A short, incrementing suffix so fixtures across a test file never collide
// on a unique index (email, patientNumber) without every call site having
// to invent its own unique value.
function unique(prefix: string) {
  counter += 1
  return `${prefix}-${counter}`
}

// Creates (or reuses, if already created in this test) a Role document
// with the real default permission set for that role name — the same
// permissions.ts DEFAULT_ROLE_PERMISSIONS the live app seeds with, not a
// hand-picked subset, so a test can't accidentally grant/omit a permission
// the real app wouldn't. Pass `extraPermissions` to test a hypothetical
// grant without touching the shared permissions.ts source of truth.
export async function createRole(name: RoleName, extraPermissions: Permission[] = []) {
  const existing = await Role.findOne({ name })
  if (existing && extraPermissions.length === 0) return existing
  const permissions = [...new Set([...DEFAULT_ROLE_PERMISSIONS[name], ...extraPermissions])]
  if (existing) {
    existing.permissions = permissions
    await existing.save()
    return existing
  }
  return Role.create({ name, permissions })
}

// Creates a User with a real Role reference, then re-fetches it populated
// — this is what makes the return value assignable to AuthedUser, the same
// shape every service function expects (`Omit<UserDoc,'role'> & {role:
// RoleDoc}`), matching what auth middleware actually attaches to `req.user`.
//
// `passwordHash` defaults to a placeholder string, not a real Argon2 hash —
// that's fine for the vast majority of fixtures, which only ever need a
// user's id/role, never to actually log in as them. Pass `overrides.password`
// (a real plaintext password) for the minority of tests that call
// auth.service.ts's login() or hit POST /auth/login through HTTP — those
// need a genuine Argon2 hash, since `verifyPassword` throws on a
// placeholder string instead of returning false. Hashing is real Argon2id
// work (~100ms), so it's opt-in rather than the default for every fixture.
export async function createUser(
  roleName: RoleName,
  overrides: Partial<{ firstName: string; lastName: string; password: string; status: 'ACTIVE' | 'INACTIVE' }> = {},
) {
  const role = await createRole(roleName)
  const user = await User.create({
    email: `${unique('user')}@test.sana`,
    passwordHash: overrides.password ? await hashPassword(overrides.password) : 'not-a-real-hash',
    firstName: overrides.firstName ?? roleName,
    lastName: overrides.lastName ?? 'TestUser',
    role: role.id,
    status: overrides.status ?? 'ACTIVE',
  })
  const populated = await User.findById(user.id).populate('role')
  return populated as unknown as AuthedUser
}

export async function createPatient() {
  return Patient.create({
    patientNumber: unique('PT'),
    firstName: 'Test',
    lastName: 'Patient',
    dob: new Date('1990-01-01'),
    gender: 'OTHER',
    status: 'ACTIVE',
  })
}

// Creates an encounter for `doctor` and `patient`, IN_PROGRESS by default
// (Encounter's own schema default) — pass `status: 'COMPLETED'` to test the
// closed-record path.
//
// `autoConsultTriggered` defaults to true — the OPPOSITE of the real
// schema's own default — so that calling addVitals() against a fixture
// encounter never flips it false-to-true and fires
// encounter.service.ts's real triggerAutoConsult side effect. That
// function does a genuine, unmocked `fetch()` to whatever AI_SERVICE_URL
// resolves to (a real local ai-service if one happens to be running), and
// it's fire-and-forget, so it can still be in flight when a test's
// afterAll() tears down the in-memory database — surfacing later as a
// "cannot log after tests are done" crash. Pass `autoConsultTriggered:
// false` only in a test that is deliberately exercising that trigger path
// (and mocks the network call itself).
export async function createEncounter(
  doctorId: string,
  patientId: string,
  overrides: Partial<{ status: 'IN_PROGRESS' | 'COMPLETED'; autoConsultTriggered: boolean }> = {},
) {
  return Encounter.create({
    patient: patientId,
    doctor: doctorId,
    chiefComplaint: 'Test chief complaint',
    status: overrides.status ?? 'IN_PROGRESS',
    autoConsultTriggered: overrides.autoConsultTriggered ?? true,
  })
}

// A booked appointment on a fixed future date — "2027-01-15" — rather than
// a computed "tomorrow," so a test's expectations about `date` never
// depend on when the test happens to run.
export async function createAppointment(
  doctorId: string,
  patientId: string,
  overrides: Partial<{ date: Date; startTime: string; endTime: string; status: AppointmentStatus }> = {},
) {
  return Appointment.create({
    appointmentNumber: unique('APT'),
    patient: patientId,
    doctor: doctorId,
    date: overrides.date ?? new Date('2027-01-15'),
    startTime: overrides.startTime ?? '09:00',
    endTime: overrides.endTime ?? '09:30',
    status: overrides.status,
  })
}

export async function createReferral(
  encounterId: string,
  patientId: string,
  fromDoctorId: string,
  toDoctorId: string,
) {
  return Referral.create({
    encounter: encounterId,
    patient: patientId,
    fromDoctor: fromDoctorId,
    toDoctor: toDoctorId,
    reason: 'Test referral reason',
  })
}

export async function createLabOrder(doctorId: string, patientId: string, encounterId: string) {
  return LabOrder.create({
    labOrderNumber: unique('LAB'),
    encounter: encounterId,
    patient: patientId,
    doctor: doctorId,
    tests: [{ testName: 'CBC' }],
  })
}

export async function createPrescription(doctorId: string, patientId: string, encounterId: string) {
  return Prescription.create({
    prescriptionNumber: unique('RX'),
    encounter: encounterId,
    patient: patientId,
    doctor: doctorId,
    medications: [{ drugName: 'Amoxicillin', dosage: '500mg', frequency: '3x daily', duration: '7 days' }],
  })
}

// A minimal-but-valid AiConsultation — `response.diagnosticGuidance` and
// `.disclaimer` are the model's only required response fields, so a fixed
// placeholder is fine wherever a test doesn't care about the AI's actual
// answer, only about who can see the record.
export async function createAiConsultation(
  encounterId: string,
  doctorId: string,
  patientId: string,
  overrides: Partial<{ source: AiConsultationSource; acuityLevel: 'STABLE' | 'URGENT' | 'CRITICAL'; acuityReasons: string[] }> = {},
) {
  return AiConsultation.create({
    encounter: encounterId,
    doctor: doctorId,
    patient: patientId,
    query: 'Test query',
    source: overrides.source ?? 'MANUAL',
    patientContext: { chiefComplaint: 'Test chief complaint' },
    response: {
      diagnosticGuidance: 'Test diagnostic guidance.',
      disclaimer: 'Test disclaimer.',
      acuityLevel: overrides.acuityLevel,
      acuityReasons: overrides.acuityReasons,
    },
  })
}

// A raw Invoice document, bypassing invoice.service.ts's own createInvoice
// — use this when a test needs an invoice fixture to already exist (e.g.
// to record a payment against) without exercising the billing-source
// validation createInvoice itself is responsible for; tests of that
// validation call the real service function instead (see
// invoice-billing.test.ts).
export async function createTestInvoice(
  patientId: string,
  encounterId: string,
  overrides: Partial<{ labOrder: string; prescription: string; total: number }> = {},
) {
  const total = overrides.total ?? 100
  return Invoice.create({
    invoiceNumber: unique('INV'),
    patient: patientId,
    encounter: encounterId,
    labOrder: overrides.labOrder,
    prescription: overrides.prescription,
    items: [{ description: 'Test line item', qty: 1, unitPrice: total, amount: total }],
    subtotal: total,
    total,
    amountPaid: 0,
    balance: total,
  })
}

export async function createPayment(
  invoiceId: string,
  receivedById: string,
  amount: number,
  method: PaymentMethod = 'CASH',
) {
  return Payment.create({ invoice: invoiceId, amount, method, receivedBy: receivedById })
}

export async function createNotification(
  userId: string,
  overrides: Partial<{ type: string; title: string; message: string; entityType: string; entityId: string; readAt: Date }> = {},
) {
  return Notification.create({
    user: userId,
    type: overrides.type ?? 'test.notification',
    title: overrides.title ?? 'Test notification',
    message: overrides.message ?? 'Test message',
    entityType: overrides.entityType,
    entityId: overrides.entityId,
    readAt: overrides.readAt,
  })
}

export async function createAuditLogEntry(
  userId: string | undefined,
  action: string,
  resource: string,
  overrides: Partial<{ resourceId: string; ipAddress: string; metadata: Record<string, unknown> }> = {},
) {
  return AuditLog.create({
    user: userId,
    action,
    resource,
    resourceId: overrides.resourceId,
    ipAddress: overrides.ipAddress,
    metadata: overrides.metadata ?? {},
  })
}
