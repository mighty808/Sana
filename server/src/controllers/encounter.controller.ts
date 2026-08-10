import type { Request, Response } from 'express'
import * as encounterService from '../services/encounter.service.js'
import * as auditService from '../services/audit.service.js'
import { ok } from '../utils/apiResponse.js'

// POST /encounters — requires 'encounter.create' (Doctor only).
// The requesting doctor becomes the encounter's `doctor` — not something
// the caller can override in the request body, since this is meant to be
// "the doctor currently logged in is opening an encounter," not an
// arbitrary assignment of encounters to other doctors.
export async function create(req: Request, res: Response) {
  const encounter = await encounterService.createEncounter(req.body, req.user!.id)
  await auditService.logAction(req, req.user!.id, 'ENCOUNTER_OPENED', 'Encounter', encounter.id)
  return ok(res, encounter, 201)
}

// GET /encounters/:id — requires 'encounter.read'.
// Returns the encounter plus its vitals and diagnoses recorded so far.
export async function getById(req: Request, res: Response) {
  const result = await encounterService.getEncounterById(req.params.id as string)
  return ok(res, result)
}

// POST /encounters/:id/vitals — requires 'vitals.create' (Nurse only).
export async function addVitals(req: Request, res: Response) {
  const vitals = await encounterService.addVitals(req.params.id as string, req.user!.id, req.body)
  await auditService.logAction(req, req.user!.id, 'VITALS_RECORDED', 'Encounter', req.params.id as string)
  return ok(res, vitals, 201)
}

// POST /encounters/:id/diagnoses — requires 'diagnosis.create' (Doctor only).
export async function addDiagnosis(req: Request, res: Response) {
  const diagnosis = await encounterService.addDiagnosis(req.params.id as string, req.user!.id, req.body)
  await auditService.logAction(req, req.user!.id, 'DIAGNOSIS_ADDED', 'Encounter', req.params.id as string, {
    diagnosis: req.body.diagnosis,
  })
  return ok(res, diagnosis, 201)
}
