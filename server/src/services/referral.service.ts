import { Encounter } from '../models/Encounter.js'
import { Patient } from '../models/Patient.js'
import { Referral, type ReferralDoc, type ReferralStatus } from '../models/Referral.js'
import { ReferralMessage } from '../models/ReferralMessage.js'
import { User } from '../models/User.js'
import { AppError, assertValidObjectId } from '../utils/apiResponse.js'
import { refToIdString } from '../utils/populate.js'
import { PUBLIC_USER_FIELDS } from '../types/user.js'
import { notify } from './notification.service.js'
import { assertEncounterOpen } from './encounter.service.js'

interface ReferralInput {
  reason: string
  notes?: string
}

// Same pattern as ai.service.ts's fetchPatientLabel — a small "Name — "
// prefix for a notification message, not worth exporting that one and
// coupling this file to ai.service.ts for a two-line helper.
async function fetchPatientLabel(patientId: string) {
  const patient = await Patient.findById(patientId).select('firstName lastName')
  return patient ? `${patient.firstName} ${patient.lastName} — ` : ''
}

// Starts a referral from an open encounter — restricted to the encounter's
// own assigned doctor, the same ownership pattern encounter.service.ts's
// addDiagnosis uses (Encounter.findOne with both _id and doctor in the
// filter, so a mismatch reports a plain 404 rather than confirming the
// encounter exists to a doctor who isn't on it).
export async function createReferral(encounterId: string, fromDoctorId: string, toDoctorId: string, input: ReferralInput) {
  assertValidObjectId(encounterId, 'encounter')
  assertValidObjectId(toDoctorId, 'toDoctor')

  const encounter = await Encounter.findOne({ _id: encounterId, doctor: fromDoctorId })
  if (!encounter) throw new AppError('Encounter not found', 404, 'ENCOUNTER_NOT_FOUND')
  assertEncounterOpen(encounter, 'refer a patient from')

  if (toDoctorId === fromDoctorId) {
    throw new AppError('Cannot refer a patient to yourself', 400, 'INVALID_REFERRAL_TARGET')
  }

  // Same check createAppointment does on its own `doctor` field — without
  // this, `toDoctor` only has to be a syntactically valid ObjectId (any
  // nurse's id, a deactivated doctor's, one that doesn't exist at all).
  // The referral would still get created and notify() would silently no-op
  // on a bad recipient, leaving it permanently stuck: updateReferralStatus
  // is scoped to `toDoctor: toDoctorId`, so no real doctor could ever
  // acknowledge or complete a referral sent to an invalid target.
  const toDoctor = await User.findOne({ _id: toDoctorId, status: 'ACTIVE' }).populate('role')
  if (!toDoctor || (toDoctor.role as unknown as { name: string })?.name !== 'DOCTOR') {
    throw new AppError('Doctor not found', 404, 'DOCTOR_NOT_FOUND')
  }

  const referral = await Referral.create({
    encounter: encounterId,
    patient: encounter.patient,
    fromDoctor: fromDoctorId,
    toDoctor: toDoctorId,
    ...input,
  })

  const patientLabel = await fetchPatientLabel(encounter.patient.toString())
  await notify(toDoctorId, {
    type: 'referral.created',
    title: 'New referral',
    message: `${patientLabel}referred to you — ${input.reason}`,
    entityType: 'Referral',
    entityId: referral.id,
  })

  return referral
}

// "Referrals sent to me" — the doctor's incoming worklist, across every
// encounter, not just the one they happen to have open. This is the one
// thing a Referral needs that a Diagnosis never did: surfacing to someone
// who wasn't already looking at this encounter.
export async function listIncomingReferrals(doctorId: string) {
  return Referral.find({ toDoctor: doctorId })
    .sort({ createdAt: -1 })
    .populate([
      { path: 'patient', select: 'firstName lastName patientNumber' },
      { path: 'fromDoctor', select: PUBLIC_USER_FIELDS },
    ])
}

// "Referrals I sent" — the mirror of listIncomingReferrals above, for the
// doctor who started them. Without this a referring doctor can only see their
// own referrals by reopening the encounter each one came from, with no way to
// ask "what have I referred out, and has anyone picked it up yet?"
//
// `toDoctor` is populated here rather than `fromDoctor`: the caller IS the
// sender, so the name worth showing is the person it went to.
export async function listOutgoingReferrals(doctorId: string) {
  return Referral.find({ fromDoctor: doctorId })
    .sort({ createdAt: -1 })
    .populate([
      { path: 'patient', select: 'firstName lastName patientNumber' },
      { path: 'toDoctor', select: PUBLIC_USER_FIELDS },
    ])
}

// Moves a referral forward (PENDING -> ACKNOWLEDGED -> COMPLETED, though
// nothing here enforces that exact order — same "any status, any order"
// looseness appointment.service.ts's updateAppointmentStatus already
// allows). Restricted to the receiving doctor only, since acknowledging or
// completing someone else's referral makes no sense — the same "only the
// owning party changes status" rule completeEncounter uses.
export async function updateReferralStatus(referralId: string, toDoctorId: string, status: ReferralStatus) {
  const referral = await Referral.findOneAndUpdate({ _id: referralId, toDoctor: toDoctorId }, { status }, {
    returnDocument: 'after',
  })
  if (!referral) throw new AppError('Referral not found', 404, 'REFERRAL_NOT_FOUND')

  // Tells the referring doctor what happened to the referral they sent —
  // same "notify the other party" shape createReferral and
  // sendReferralMessage already use, just pointed the other direction this
  // time (fromDoctor, not toDoctor). Without this, the only doctor who ever
  // hears about a status change is the one who just made it.
  const actingDoctor = await User.findById(toDoctorId).select('firstName lastName')
  const patientLabel = await fetchPatientLabel(referral.patient.toString())
  await notify(referral.fromDoctor.toString(), {
    type: 'referral.status.updated',
    title: 'Referral updated',
    message: `${patientLabel}Dr. ${actingDoctor?.firstName} ${actingDoctor?.lastName} marked your referral ${status.toLowerCase()}`,
    entityType: 'Referral',
    entityId: referral.id,
  })

  return referral
}

// Shared gate for both message endpoints below. A 404 rather than a 403 —
// same "don't confirm existence to someone who isn't on it" reasoning
// createReferral's own encounter lookup uses — so a doctor who isn't
// fromDoctor or toDoctor on this referral can't even tell it exists.
// refToIdString handles both a raw ObjectId (the common case here, since
// callers don't populate these fields just to check ownership) and an
// already-populated document, so this stays correct regardless of how the
// caller loaded the referral.
function assertReferralParticipant(referral: ReferralDoc, userId: string) {
  const isParticipant = refToIdString(referral.fromDoctor) === userId || refToIdString(referral.toDoctor) === userId
  if (!isParticipant) throw new AppError('Referral not found', 404, 'REFERRAL_NOT_FOUND')
}

// The full thread on one referral, oldest first (how a chat reads), for
// whichever of the two doctors on it is asking.
export async function listReferralMessages(referralId: string, userId: string) {
  assertValidObjectId(referralId, 'referral')
  const referral = await Referral.findById(referralId)
  if (!referral) throw new AppError('Referral not found', 404, 'REFERRAL_NOT_FOUND')
  assertReferralParticipant(referral, userId)

  return ReferralMessage.find({ referral: referralId })
    .sort({ createdAt: 1 })
    .populate({ path: 'sender', select: PUBLIC_USER_FIELDS })
}

// Posts one message and notifies whichever of fromDoctor/toDoctor didn't
// send it — the same "tell the other party" shape createReferral already
// uses for the referral itself, reusing its fetchPatientLabel helper so
// the notification text reads the same way ("<Patient> — ...").
export async function sendReferralMessage(referralId: string, senderId: string, body: string) {
  assertValidObjectId(referralId, 'referral')
  const referral = await Referral.findById(referralId)
  if (!referral) throw new AppError('Referral not found', 404, 'REFERRAL_NOT_FOUND')
  assertReferralParticipant(referral, senderId)

  const message = await ReferralMessage.create({ referral: referralId, sender: senderId, body })

  const recipientId = refToIdString(referral.fromDoctor) === senderId ? refToIdString(referral.toDoctor) : refToIdString(referral.fromDoctor)
  const sender = await User.findById(senderId).select('firstName lastName')
  const patientLabel = await fetchPatientLabel(referral.patient.toString())
  await notify(recipientId!, {
    type: 'referral.message.created',
    title: 'New referral message',
    message: `${patientLabel}Dr. ${sender?.firstName} ${sender?.lastName}: ${body}`,
    entityType: 'Referral',
    entityId: referral.id,
  })

  return message
}
