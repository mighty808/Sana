import type { Request, Response } from 'express'
import * as encounterService from '../services/encounter.service.js'
import * as referralService from '../services/referral.service.js'
import * as prescriptionService from '../services/prescription.service.js'
import * as auditService from '../services/audit.service.js'
import { ok } from '../utils/apiResponse.js'

// POST /encounters — requires 'encounter.create' (Nurse only). The caller
// never specifies the encounter's `doctor` directly. A nurse isn't assigned
// to a doctor, so the encounter's doctor is always whichever doctor the
// given `appointment` was already booked with. See encounter.service.ts's
// createEncounter for the full logic, including the 400 error it throws if
// `appointment` is left out.
export async function create(req: Request, res: Response) {
  const encounter = await encounterService.createEncounter(req.body)
  await auditService.logAction(req, req.user!.id, 'ENCOUNTER_OPENED', 'Encounter', encounter.id)
  return ok(res, encounter, 201)
}

// GET /encounters?status= — requires 'encounter.read' (Admin, Nurse,
// Doctor). listEncounters() itself narrows the results by role — see the comment there.
export async function list(req: Request, res: Response) {
  const statusFilter = typeof req.query.status === 'string' ? req.query.status : undefined
  const encounters = await encounterService.listEncounters(req.user!, statusFilter)
  return ok(res, encounters)
}

// GET /encounters/ward-board — requires 'encounter.read'. Every currently
// open (IN_PROGRESS) encounter, each carrying its most recent acuity read
// if one exists — see encounter.service.ts's getWardBoard.
export async function wardBoard(req: Request, res: Response) {
  const board = await encounterService.getWardBoard(req.user!)
  return ok(res, board)
}

// GET /encounters/:id — requires 'encounter.read'.
// Returns the encounter plus its vitals and diagnoses recorded so far.
export async function getById(req: Request, res: Response) {
  const result = await encounterService.getEncounterById(req.params.id as string, req.user!)
  return ok(res, result)
}

// POST /encounters/:id/vitals — requires 'vitals.create' (Nurse only).
export async function addVitals(req: Request, res: Response) {
  const vitals = await encounterService.addVitals(req.params.id as string, req.user!.id, req.body)
  await auditService.logAction(req, req.user!.id, 'VITALS_RECORDED', 'Encounter', req.params.id as string)
  return ok(res, vitals, 201)
}

// PATCH /encounters/:id/vitals/:vitalId — requires 'vitals.update' (Nurse only).
export async function updateVitals(req: Request, res: Response) {
  const vitals = await encounterService.updateVitals(req.params.id as string, req.params.vitalId as string, req.body)
  await auditService.logAction(req, req.user!.id, 'VITALS_UPDATED', 'Encounter', req.params.id as string)
  return ok(res, vitals)
}

// POST /encounters/:id/diagnoses — requires 'diagnosis.create' (Doctor only).
export async function addDiagnosis(req: Request, res: Response) {
  const diagnosis = await encounterService.addDiagnosis(req.params.id as string, req.user!.id, req.body)
  await auditService.logAction(req, req.user!.id, 'DIAGNOSIS_ADDED', 'Encounter', req.params.id as string, {
    diagnosis: req.body.diagnosis,
  })
  return ok(res, diagnosis, 201)
}

// PATCH /encounters/:id/diagnoses/:diagnosisId — requires 'diagnosis.update'
// (Doctor only, and only the doctor who added it).
export async function updateDiagnosis(req: Request, res: Response) {
  const diagnosis = await encounterService.updateDiagnosis(
    req.params.id as string,
    req.params.diagnosisId as string,
    req.user!.id,
    req.body,
  )
  await auditService.logAction(req, req.user!.id, 'DIAGNOSIS_UPDATED', 'Encounter', req.params.id as string, {
    diagnosis: req.body.diagnosis,
  })
  return ok(res, diagnosis)
}

// POST /encounters/:id/referrals — requires 'referral.create' (Doctor
// only, and only the doctor assigned to this encounter).
export async function addReferral(req: Request, res: Response) {
  const { toDoctor, ...input } = req.body
  const referral = await referralService.createReferral(req.params.id as string, req.user!.id, toDoctor, input)
  await auditService.logAction(req, req.user!.id, 'REFERRAL_CREATED', 'Encounter', req.params.id as string, {
    toDoctor,
  })
  return ok(res, referral, 201)
}

// POST /encounters/:id/prescriptions — requires 'prescription.create'
// (Doctor only, and only the doctor assigned to this encounter).
export async function addPrescription(req: Request, res: Response) {
  const prescription = await prescriptionService.createPrescription(
    req.params.id as string,
    req.user!.id,
    req.body.medications,
  )
  await auditService.logAction(req, req.user!.id, 'PRESCRIPTION_CREATED', 'Encounter', req.params.id as string, {
    prescriptionNumber: prescription.prescriptionNumber,
    medications: prescription.medications.map((m) => m.drugName),
  })
  return ok(res, prescription, 201)
}

// PATCH /encounters/:id/complete — requires 'encounter.complete' (Doctor
// only, and only the doctor assigned to this specific encounter).
export async function complete(req: Request, res: Response) {
  const encounter = await encounterService.completeEncounter(req.params.id as string, req.user!.id)
  await auditService.logAction(req, req.user!.id, 'ENCOUNTER_COMPLETED', 'Encounter', encounter.id)
  return ok(res, encounter)
}
