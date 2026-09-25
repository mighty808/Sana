import { Encounter, ENCOUNTER_STATUSES, type EncounterStatus, type EncounterDoc } from '../models/Encounter.js'
import { VitalSign } from '../models/VitalSign.js'
import { Diagnosis } from '../models/Diagnosis.js'
import { Referral } from '../models/Referral.js'
import { Prescription } from '../models/Prescription.js'
import { Patient } from '../models/Patient.js'
import { Appointment } from '../models/Appointment.js'
import { AiConsultation, AI_ACUITY_LEVELS } from '../models/AiConsultation.js'
import { AppError, assertValidObjectId } from '../utils/apiResponse.js'
import { PUBLIC_USER_FIELDS } from '../types/user.js'
import type { AuthedUser } from '../types/user.js'
import { triggerAutoConsult } from './ai.service.js'
import { logger } from '../utils/logger.js'
import { broadcastWardBoardChanged } from '../config/socket.js'
import { scopeToOwnDoctor } from '../utils/queryScope.js'
import { refToIdString } from '../utils/populate.js'

// A COMPLETED encounter is a closed clinical record (see completeEncounter
// below for how it gets there). Nothing on it can change after that, not
// even something that was already there before it closed. Every function
// that edits one of an encounter's sub-records (vitals, diagnoses, lab
// orders) calls this one shared check, instead of each writing its own
// copy of the same check, so a new sub-record type added later can't
// forget to enforce it. `action` supplies the specific phrase for the
// error message, e.g. "record vitals on".
export function assertEncounterOpen(encounter: EncounterDoc, action: string): void {
  if (encounter.status === 'COMPLETED') {
    throw new AppError(`Cannot ${action} a completed encounter`, 409, 'ENCOUNTER_COMPLETED')
  }
}

interface CreateEncounterInput {
  patient: string
  appointment: string
  chiefComplaint: string
  history?: string
}

// Opens a new encounter — the actual clinical record of a visit. Only a
// nurse holds 'encounter.create'. The intended flow is that a nurse opens
// the encounter at check-in and records vitals, and the doctor then
// continues the clinical work on that same encounter (diagnoses, lab
// orders) rather than creating a separate one of their own. A nurse has no
// patients or doctor assigned to her personally, so `appointment` is
// always required here — the encounter's doctor field is copied from
// whichever doctor that appointment was already booked with, never from
// the nurse's own id, since the nurse isn't the one doing the clinical
// work. Both the referenced patient and appointment are checked to
// actually exist before anything is written.
export async function createEncounter(input: CreateEncounterInput) {
  assertValidObjectId(input.patient, 'patient')
  assertValidObjectId(input.appointment, 'appointment')

  const [patient, appointment] = await Promise.all([
    Patient.findOne({ _id: input.patient, status: 'ACTIVE' }),
    Appointment.findById(input.appointment),
  ])

  if (!patient) throw new AppError('Patient not found', 404, 'PATIENT_NOT_FOUND')
  if (!appointment) throw new AppError('Appointment not found', 404, 'APPOINTMENT_NOT_FOUND')

  const doctorId = appointment.doctor.toString()

  const encounter = await Encounter.create({
    patient: input.patient,
    appointment: input.appointment,
    chiefComplaint: input.chiefComplaint,
    history: input.history,
    doctor: doctorId,
  })

  // Save the new encounter's id back onto the appointment already loaded
  // above, so anyone looking at the appointment afterward can find the
  // encounter that was opened for it. Without this, there'd be no way to
  // go from an appointment to its encounter. See the `encounter` field's
  // comment in models/Appointment.ts. Reuses the document from the
  // Promise.all above instead of a second findByIdAndUpdate round trip for
  // the same appointment.
  appointment.encounter = encounter._id
  await appointment.save()

  return encounter
}

// Lists encounters, filtered by the requesting user's role — the same "one
// endpoint, results scoped per role" pattern as listAppointments in
// appointment.service.ts:
//   - ADMIN, NURSE: see every encounter. There's no per-ward restriction in
//     this version of the system, for the same reasons as appointments.
//   - DOCTOR: sees only encounters where they're the assigned doctor —
//     every one of which was opened on their behalf by a nurse, since a
//     doctor never opens their own encounter (see createEncounter above).
// `statusFilter`, if given, narrows the results further — for example, a
// nurse checking what's still IN_PROGRESS. The patient and doctor fields
// are always fully populated for every role, including a doctor's own
// list, to keep the shape of an encounter the same everywhere it's
// returned from.
export async function listEncounters(user: AuthedUser, statusFilter?: string) {
  if (statusFilter && !ENCOUNTER_STATUSES.includes(statusFilter as EncounterStatus)) {
    throw new AppError(
      `Invalid status filter '${statusFilter}' — expected one of ${ENCOUNTER_STATUSES.join(', ')}`,
      400,
      'INVALID_STATUS',
    )
  }

  const filter: Record<string, unknown> = {}
  if (statusFilter) filter.status = statusFilter
  scopeToOwnDoctor(filter, user)

  return Encounter.find(filter)
    .populate([{ path: 'patient' }, { path: 'doctor', select: PUBLIC_USER_FIELDS }])
    .sort({ startedAt: -1 })
}

// A one-screen view of every currently open encounter, each carrying
// whatever the most recent acuity read said about it — so a doctor (or
// admin/nurse, same role scoping as listEncounters above) can scan the
// whole ward for anyone trending badly instead of opening each encounter
// one at a time. An encounter with no acuity read yet (nobody has run the
// nurse's AI Analysis on it) just comes back with acuityLevel undefined —
// this never triggers Sana AI itself, it only reads whatever's already
// been recorded.
export async function getWardBoard(user: AuthedUser) {
  const filter: Record<string, unknown> = { status: 'IN_PROGRESS' }
  scopeToOwnDoctor(filter, user)

  const encounters = await Encounter.find(filter)
    .select('patient doctor chiefComplaint startedAt')
    .populate([{ path: 'patient', select: 'firstName lastName patientNumber' }, { path: 'doctor', select: PUBLIC_USER_FIELDS }])
    .sort({ startedAt: 1 })

  // One aggregation across every encounter on the board, rather than one
  // query per encounter — $sort then $group's $first pulls out just the
  // latest acuity-bearing consultation per encounter in a single round trip.
  const acuityRows = await AiConsultation.aggregate([
    {
      $match: {
        encounter: { $in: encounters.map((e) => e._id) },
        // Every consultation stores an acuityLevel key, even ones that
        // never assessed acuity — the AI service's Python side sends
        // `null` (not an omitted field) for those, which Mongoose then
        // persists literally. $exists alone would match all of them, so
        // this checks for an actual level value instead.
        'response.acuityLevel': { $in: AI_ACUITY_LEVELS },
      },
    },
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: '$encounter',
        acuityLevel: { $first: '$response.acuityLevel' },
        acuityReasons: { $first: '$response.acuityReasons' },
        assessedAt: { $first: '$createdAt' },
      },
    },
  ])
  const acuityByEncounter = new Map(acuityRows.map((row) => [row._id.toString(), row]))

  return encounters.map((encounter) => {
    const acuity = acuityByEncounter.get(encounter.id)
    return {
      _id: encounter.id,
      patient: encounter.patient,
      doctor: encounter.doctor,
      chiefComplaint: encounter.chiefComplaint,
      startedAt: encounter.startedAt,
      acuityLevel: acuity?.acuityLevel,
      acuityReasons: acuity?.acuityReasons,
      assessedAt: acuity?.assessedAt,
    }
  })
}

// Fetches one encounter along with its full clinical context: the vitals,
// diagnoses, and referrals recorded against it so far. Each lives in its
// own separate collection (see models/VitalSign.ts, models/Diagnosis.ts,
// models/Referral.ts), not embedded inside the encounter document, so
// they're fetched here as separate queries rather than through populate().
//
// The encounter itself is looked up first, before the other queries run,
// so that a request for an encounter id that doesn't exist fails fast with
// a 404 right away, instead of always running every query even when none
// of them can ever return anything useful.
// Decides whether `user` may read one specific encounter, for the direct
// by-id lookups (GET /encounters/:id and GET /lab-orders?encounter=).
// Those bypass the role scoping that listEncounters/getWardBoard get from
// scopeToOwnDoctor, so without this a Doctor could read any encounter in
// the hospital — including patients they have no relationship with — just
// by trying ids, even though the same records are deliberately hidden from
// their own list views.
//
// ADMIN and NURSE are unrestricted, matching their list views, which are
// already unscoped (an admin supervises the whole system; a nurse is
// front-desk for every patient). PATIENT never reaches here at all — the
// role doesn't hold 'encounter.read'.
//
// A DOCTOR gets three ways in, which together cover every route the UI can
// actually navigate from (appointments, the encounters list, and the ward
// board only ever link to their own; the other two are below):
//   1. It's their own encounter.
//   2. It was referred to them — ReferralsPage links the receiving doctor
//      straight to the referring doctor's encounter, which is the whole
//      point of a referral.
//   3. They've treated this patient before, which is exactly the same
//      "has an encounter with this patient" test getPatientTimeline already
//      uses to decide whether a doctor may see the patient at all. Without
//      it, the prior-visit links on that timeline would 404 for the very
//      doctor the timeline just decided is allowed to see the patient.
// Anything else is a 404 — the same "not found" a nonexistent id gives, so
// this never confirms that an encounter it's hiding actually exists.
// Returns a boolean rather than throwing, so each caller can raise the
// error that fits what *it* was asked for — a lab-order lookup should 404
// as a missing lab order, not as a missing encounter.
async function mayDoctorReadLoadedEncounter(
  encounterId: string,
  encounter: { doctor: unknown; patient: unknown },
  user: AuthedUser,
): Promise<boolean> {
  if (user.role.name !== 'DOCTOR') return true
  // `doctor` arrives populated from getEncounterById and as a raw ObjectId
  // from the id-only path below, so both shapes are normalized to a plain
  // id string rather than assuming either one (asPopulated() is a
  // compile-time cast only — it would not actually make an unpopulated
  // ObjectId behave like a document here).
  if (refToIdString(encounter.doctor) === user.id) return true

  const [referredToThem, treatsThisPatient] = await Promise.all([
    Referral.exists({ encounter: encounterId, toDoctor: user.id }),
    Encounter.exists({ patient: refToIdString(encounter.patient), doctor: user.id }),
  ])
  return Boolean(referredToThem || treatsThisPatient)
}

// The same rule for callers that hold an encounter id but haven't loaded
// the encounter (the lab-order lookups, which hang off an encounter).
// Loads only the two fields the check actually needs. A missing encounter
// counts as "may not read", so callers get one uniform negative answer
// whether the id is unknown or simply not theirs.
export async function mayReadEncounter(encounterId: string, user: AuthedUser): Promise<boolean> {
  if (user.role.name !== 'DOCTOR') return true
  const encounter = await Encounter.findById(encounterId).select('doctor patient')
  if (!encounter) return false
  return mayDoctorReadLoadedEncounter(encounterId, encounter, user)
}

export async function getEncounterById(id: string, user: AuthedUser) {
  // `doctor` is restricted to PUBLIC_USER_FIELDS here — populating the
  // full `doctor` field with no restriction would embed the doctor's
  // entire User document, password hash included, into this response.
  const encounter = await Encounter.findById(id).populate([
    { path: 'patient' },
    { path: 'doctor', select: PUBLIC_USER_FIELDS },
    { path: 'appointment' },
  ])
  if (!encounter) throw new AppError('Encounter not found', 404, 'ENCOUNTER_NOT_FOUND')
  // Deliberately the same 404 an unknown id gives, so this never confirms
  // that an encounter it's hiding actually exists.
  if (!(await mayDoctorReadLoadedEncounter(id, encounter, user))) {
    throw new AppError('Encounter not found', 404, 'ENCOUNTER_NOT_FOUND')
  }

  const [vitals, diagnoses, referrals, prescriptions] = await Promise.all([
    VitalSign.find({ encounter: id }).sort({ recordedAt: 1 }),
    Diagnosis.find({ encounter: id }).sort({ createdAt: 1 }),
    // Shown to whoever is allowed to open this encounter at all (see
    // mayReadEncounter above), so the referring doctor sees their own
    // outgoing referral's status, and a receiving doctor who followed the
    // notification link sees why they were referred — being referred is
    // itself one of the things that grants them access here.
    Referral.find({ encounter: id })
      .sort({ createdAt: 1 })
      .populate([{ path: 'toDoctor', select: PUBLIC_USER_FIELDS }, { path: 'fromDoctor', select: PUBLIC_USER_FIELDS }]),
    // Populated the same way listPrescriptions() and getPatientTimeline()
    // always are: the client's Prescription type declares `patient` and
    // `doctor` as full objects on every endpoint that returns one, never
    // raw id strings. Returning them unpopulated here would satisfy the
    // compiler (the type would simply be lying) but hand the UI
    // `undefined` the moment anything on this page reads a prescription's
    // patient or doctor.
    Prescription.find({ encounter: id })
      .sort({ createdAt: 1 })
      .populate([{ path: 'patient' }, { path: 'doctor', select: PUBLIC_USER_FIELDS }]),
  ])

  return { encounter, vitals, diagnoses, referrals, prescriptions }
}

interface VitalsInput {
  temperature?: number
  heartRate?: number
  respiratoryRate?: number
  systolicBp?: number
  diastolicBp?: number
  oxygenSaturation?: number
  weight?: number
  height?: number
}

// Same fields as VitalsInput, but each one may also be explicitly `null` —
// updateVitals (below) treats that as "clear this measurement" rather than
// "leave it alone" (an omitted/undefined key). JSON has no way to send "an
// undefined key" over the wire, so `null` is the only way a client can ever
// express "correct this to empty" instead of "correct this to a number."
interface UpdateVitalsInput {
  temperature?: number | null
  heartRate?: number | null
  respiratoryRate?: number | null
  systolicBp?: number | null
  diastolicBp?: number | null
  oxygenSaturation?: number | null
  weight?: number | null
  height?: number | null
}

// Records one set of vitals against an encounter — typically done by a nurse.
export async function addVitals(encounterId: string, recordedBy: string, input: VitalsInput) {
  const encounter = await Encounter.findById(encounterId)
  if (!encounter) throw new AppError('Encounter not found', 404, 'ENCOUNTER_NOT_FOUND')
  assertEncounterOpen(encounter, 'record vitals on')

  const vitals = await VitalSign.create({
    ...input,
    encounter: encounterId,
    patient: encounter.patient,
    recordedBy,
  })

  // The FIRST set of vitals recorded on an encounter automatically kicks
  // off a Sana AI consultation, so the doctor already has a suggestion
  // waiting when they open the encounter, instead of having to remember to
  // ask for one (see triggerAutoConsult in ai.service.ts). Only the first
  // set of vitals does this — a nurse re-checking vitals later in the same
  // visit shouldn't trigger another AI call for essentially the same
  // chief complaint.
  //
  // Whether this is really the "first" set of vitals is decided by trying
  // to flip the encounter's own autoConsultTriggered flag from false to
  // true in a single database update, not by comparing how many VitalSign
  // records exist. Comparing counts used to be how this worked, but if two
  // vitals submissions for the same encounter land at nearly the same
  // moment, both could read back the same final count and neither would
  // match "exactly one", so the trigger would silently never fire. With
  // the flag-flip approach, MongoDB only lets one of two simultaneous
  // updates actually change the flag from false to true, so exactly one of
  // them ever sees `claimed` come back truthy below. This isn't awaited by
  // the caller, the same fire-and-forget approach triggerAutoConsult
  // itself uses, so the nurse's vitals save doesn't have to wait on the
  // AI call's latency.
  Encounter.findOneAndUpdate({ _id: encounterId, autoConsultTriggered: false }, { autoConsultTriggered: true })
    .then((claimed) => {
      if (claimed) triggerAutoConsult(encounterId, encounter.doctor.toString())
    })
    .catch((err) => {
      logger.warn(`Auto-consult claim failed for encounter ${encounterId}: ${(err as Error).message}`)
    })

  broadcastWardBoardChanged(encounterId)
  return vitals
}

// Corrects a previously-recorded vitals entry. Uses the same closed-record
// guard as addVitals — once the encounter is COMPLETED, nothing on it can
// change, new or existing. This isn't restricted to the specific nurse who
// originally recorded the entry, unlike a diagnosis, which is owned by the
// doctor who wrote it. Any nurse holding the 'vitals.update' permission can
// correct any vitals entry on an encounter that's still open.
export async function updateVitals(encounterId: string, vitalId: string, input: UpdateVitalsInput) {
  const encounter = await Encounter.findById(encounterId)
  if (!encounter) throw new AppError('Encounter not found', 404, 'ENCOUNTER_NOT_FOUND')
  assertEncounterOpen(encounter, 'edit vitals on')

  const vitals = await VitalSign.findOne({ _id: vitalId, encounter: encounterId })
  if (!vitals) throw new AppError('Vitals entry not found', 404, 'VITALS_NOT_FOUND')

  // Applied key by key rather than one `vitals.set(input)` call, so that
  // each of the three possible values in `input` (see UpdateVitalsInput)
  // does something different: a number corrects that measurement, `null`
  // explicitly clears it (unsets the path, the same as it never having
  // been recorded), and an omitted/undefined key is left completely
  // untouched. A single `.set(input)` can't tell "clear this" apart from
  // "leave this alone" — both would arrive as the key being absent, since
  // JSON has no way to send an undefined value — which is what previously
  // let a cleared field silently keep its old value.
  for (const [key, value] of Object.entries(input) as Array<[keyof UpdateVitalsInput, number | null | undefined]>) {
    if (value === undefined) continue
    vitals.set(key, value === null ? undefined : value)
  }
  await vitals.save()
  broadcastWardBoardChanged(encounterId)
  return vitals
}

// Removes a vitals entry recorded in error. Same closed-record guard and
// no-owner-scoping rule as updateVitals — any nurse holding
// 'vitals.delete' can remove any vitals entry on an encounter that's
// still open, not just the one who recorded it.
export async function deleteVitals(encounterId: string, vitalId: string) {
  const encounter = await Encounter.findById(encounterId)
  if (!encounter) throw new AppError('Encounter not found', 404, 'ENCOUNTER_NOT_FOUND')
  assertEncounterOpen(encounter, 'delete vitals on')

  const vitals = await VitalSign.findOneAndDelete({ _id: vitalId, encounter: encounterId })
  if (!vitals) throw new AppError('Vitals entry not found', 404, 'VITALS_NOT_FOUND')
  broadcastWardBoardChanged(encounterId)
  return vitals
}

interface DiagnosisInput {
  diagnosis: string
  diagnosisCode?: string
  notes?: string
}

// Adds a diagnosis to an encounter — done by the doctor running that
// encounter. This is restricted to the assigned doctor only, the same
// ownership rule completeEncounter uses below, so a different doctor
// can't write a diagnosis onto someone else's encounter. A doctor who is
// allowed to read that encounter (referred to them, or they've treated the
// patient before — see mayReadEncounter above) can still open it through
// GET /encounters/:id; they just can't add anything to it.
export async function addDiagnosis(encounterId: string, doctorId: string, input: DiagnosisInput) {
  const encounter = await Encounter.findOne({ _id: encounterId, doctor: doctorId })
  if (!encounter) throw new AppError('Encounter not found', 404, 'ENCOUNTER_NOT_FOUND')
  assertEncounterOpen(encounter, 'add a diagnosis to')

  const diagnosis = await Diagnosis.create({
    ...input,
    encounter: encounterId,
    patient: encounter.patient,
    doctor: doctorId,
  })
  broadcastWardBoardChanged(encounterId)
  return diagnosis
}

// Corrects a previously-added diagnosis. Uses the same closed-record guard
// as addDiagnosis, and is also restricted to the same doctor who added the
// diagnosis in the first place. As with completeEncounter below, if the
// doctor doesn't match (or the id doesn't exist at all), this reports a
// plain 404 rather than a 403.
export async function updateDiagnosis(
  encounterId: string,
  diagnosisId: string,
  doctorId: string,
  input: DiagnosisInput,
) {
  // Scoped to `doctor: doctorId`, the same as addDiagnosis — a diagnosis
  // can only ever have been created by the encounter's own assigned
  // doctor (addDiagnosis requires that too), so this can never reject a
  // legitimate caller. Scoping it here, rather than loading the encounter
  // unconditionally, matters: without it, a doctor with no relationship to
  // this encounter at all would learn whether it's COMPLETED (a 409) vs.
  // still open, before the diagnosis-ownership check further down ever
  // runs — a small information leak to someone who shouldn't be able to
  // tell this encounter exists.
  const encounter = await Encounter.findOne({ _id: encounterId, doctor: doctorId })
  if (!encounter) throw new AppError('Encounter not found', 404, 'ENCOUNTER_NOT_FOUND')
  assertEncounterOpen(encounter, 'edit a diagnosis on')

  // Loaded, `.set()`, then `.save()` rather than findOneAndUpdate, so that
  // schema validators and any save hooks run on the corrected values, and
  // so this reads the same way as updateVitals above.
  //
  // Note for anyone reviewing this: an earlier version of this comment
  // claimed findOneAndUpdate(filter, input) without `$set` would replace
  // the whole document and wipe the required encounter/patient/doctor
  // fields. That is true of the raw MongoDB driver but NOT of Mongoose,
  // which wraps an operator-free update object in `$set` for you —
  // verified directly against this project's own Mongoose (9.x) and
  // database: a plain `findOneAndUpdate(filter, { status })` left every
  // other field on the document intact. Both styles are safe here; don't
  // "fix" the plain findOneAndUpdate calls elsewhere in this codebase on
  // the strength of that old claim.
  const diagnosis = await Diagnosis.findOne({ _id: diagnosisId, encounter: encounterId, doctor: doctorId })
  if (!diagnosis) throw new AppError('Diagnosis not found', 404, 'DIAGNOSIS_NOT_FOUND')
  diagnosis.set(input)
  await diagnosis.save()
  broadcastWardBoardChanged(encounterId)
  return diagnosis
}

// Removes a diagnosis entered in error — same ownership and closed-record
// guards as updateDiagnosis (a wrong diagnosis deserves the same correction
// rights as a mistyped one), just deleting rather than correcting it.
export async function deleteDiagnosis(encounterId: string, diagnosisId: string, doctorId: string) {
  const encounter = await Encounter.findOne({ _id: encounterId, doctor: doctorId })
  if (!encounter) throw new AppError('Encounter not found', 404, 'ENCOUNTER_NOT_FOUND')
  assertEncounterOpen(encounter, 'delete a diagnosis on')

  const diagnosis = await Diagnosis.findOneAndDelete({ _id: diagnosisId, encounter: encounterId, doctor: doctorId })
  if (!diagnosis) throw new AppError('Diagnosis not found', 404, 'DIAGNOSIS_NOT_FOUND')
  broadcastWardBoardChanged(encounterId)
  return diagnosis
}

// Closes out an encounter — the last step of the clinical workflow, coming
// after vitals and a diagnosis have been recorded, and before an invoice
// can meaningfully be generated from it. This is restricted to the
// assigned doctor only, the same ownership rule appointment.service.ts's
// updateAppointmentStatus uses for a doctor caller, so a different doctor
// can't close out someone else's encounter. As elsewhere in this codebase,
// a mismatch reports a plain 404 instead of a 403, so it never confirms to
// the wrong doctor that some other doctor's encounter exists.
//
// This doesn't check that vitals or a diagnosis were actually recorded
// first. The normal workflow strongly implies that order, but nothing
// here forces it — the same approach already taken with appointment
// status, where any status transition is allowed rather than enforcing a
// strict sequence.
export async function completeEncounter(id: string, doctorId: string) {
  const encounter = await Encounter.findOne({ _id: id, doctor: doctorId })
  if (!encounter) throw new AppError('Encounter not found', 404, 'ENCOUNTER_NOT_FOUND')
  if (encounter.status === 'COMPLETED') {
    throw new AppError('This encounter is already completed', 409, 'ALREADY_COMPLETED')
  }

  encounter.status = 'COMPLETED'
  encounter.completedAt = new Date()
  await encounter.save()
  broadcastWardBoardChanged(id)
  return encounter
}
