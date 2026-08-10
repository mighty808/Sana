import type { Request, Response } from 'express'
import * as patientService from '../services/patient.service.js'
import * as auditService from '../services/audit.service.js'
import { ok } from '../utils/apiResponse.js'

// POST /patients — requires 'patient.create' (Admin and Doctor per the
// default role permissions in types/permissions.ts).
export async function create(req: Request, res: Response) {
  const patient = await patientService.createPatient(req.body)
  await auditService.logAction(req, req.user!.id, 'PATIENT_REGISTERED', 'Patient', patient.id, {
    patientNumber: patient.patientNumber,
  })
  return ok(res, patient, 201)
}

// GET /patients?search=&page=&limit= — requires 'patient.read'.
// Note: the PATIENT role does NOT have 'patient.read' in its default
// permission set (see types/permissions.ts) — patients aren't meant to
// browse the patient directory, only their OWN appointments/results/invoices
// via those specific endpoints in later phases. So this route is effectively
// staff-only already, purely through the RBAC permission check.
export async function search(req: Request, res: Response) {
  const { search, page, limit } = req.query
  const result = await patientService.searchPatients({
    search: typeof search === 'string' ? search : undefined,
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
  })
  return ok(res, result)
}

// GET /patients/:id — requires 'patient.read'.
// (`as string` below: Express 5's types allow route params to theoretically
// be string[] for advanced wildcard routes, but our route only ever declares
// a single `:id` segment, so it's always a plain string at runtime.)
export async function getById(req: Request, res: Response) {
  const patient = await patientService.getPatientById(req.params.id as string)
  return ok(res, patient)
}

// PATCH /patients/:id — requires 'patient.update'.
export async function update(req: Request, res: Response) {
  const patient = await patientService.updatePatient(req.params.id as string, req.body)
  await auditService.logAction(req, req.user!.id, 'PATIENT_UPDATED', 'Patient', patient.id, req.body)
  return ok(res, patient)
}

// GET /patients/:id/timeline — requires 'patient.read'.
// Returns the patient's chronological event history for the record view.
// Appointments/encounters/lab orders/invoices don't exist as collections
// yet (they land in Phases 4, 5, and 7) — for now this confirms the patient
// exists and returns empty arrays as placeholders the frontend can already
// build against, to be filled in as each phase adds its data source.
export async function timeline(req: Request, res: Response) {
  const patient = await patientService.getPatientById(req.params.id as string)
  return ok(res, {
    patient,
    appointments: [],
    encounters: [],
    labOrders: [],
    invoices: [],
  })
}
