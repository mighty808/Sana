import type { Request, Response } from 'express'
import * as patientService from '../services/patient.service.js'
import * as auditService from '../services/audit.service.js'
import { ok } from '../utils/apiResponse.js'

// POST /patients — requires 'patient.create' (Nurse only, per the default
// role permissions in types/permissions.ts). The nurse is the front-line
// staff member who registers a patient when they physically arrive.
export async function create(req: Request, res: Response) {
  const patient = await patientService.createPatient(req.body)
  await auditService.logAction(req, req.user!.id, 'PATIENT_REGISTERED', 'Patient', patient.id, {
    patientNumber: patient.patientNumber,
  })
  return ok(res, patient, 201)
}

// GET /patients?search=&page=&limit= — requires 'patient.read'.
// Note: the PATIENT role does NOT have 'patient.read' in its default
// permission set (see types/permissions.ts). Patients aren't meant to
// browse the full patient directory, only their own appointments, results,
// and invoices, through those specific endpoints. So this route already
// ends up staff-only, just from the permission check alone. Admin and Nurse
// see the full directory. A Doctor caller only sees patients they have an
// encounter with — see searchPatients() in patient.service.ts.
export async function search(req: Request, res: Response) {
  const { search, page, limit } = req.query
  const result = await patientService.searchPatients(
    {
      search: typeof search === 'string' ? search : undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    },
    req.user!,
  )
  return ok(res, result)
}

// GET /patients/:id — requires 'patient.read'. The same restriction for
// Doctor callers applies here as on the search/list endpoint above — see
// getPatientById in patient.service.ts.
// (`as string` below: Express 5's types technically allow a route param to
// be an array of strings, for advanced wildcard routes, but our route only
// ever declares a single `:id` segment, so at runtime it's always a plain string.)
export async function getById(req: Request, res: Response) {
  const patient = await patientService.getPatientById(req.params.id as string, req.user!)
  return ok(res, patient)
}

// PATCH /patients/:id — requires 'patient.update'.
export async function update(req: Request, res: Response) {
  const patient = await patientService.updatePatient(req.params.id as string, req.body)
  await auditService.logAction(req, req.user!.id, 'PATIENT_UPDATED', 'Patient', patient.id, req.body)
  return ok(res, patient)
}

// GET /patients/:id/timeline — requires 'patient.read'.
// Returns the patient's real chronological event history for the record
// view — every encounter, lab order, and invoice tied to them.
export async function timeline(req: Request, res: Response) {
  const result = await patientService.getPatientTimeline(req.params.id as string, req.user!)
  return ok(res, result)
}
