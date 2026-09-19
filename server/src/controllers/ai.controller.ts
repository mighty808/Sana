import type { Request, Response } from 'express'
import * as aiService from '../services/ai.service.js'
import * as auditService from '../services/audit.service.js'
import { ok } from '../utils/apiResponse.js'
import type { AiReviewStatus } from '../models/AiConsultation.js'

// POST /ai/consult — requires 'ai.consult' (Doctor only). This route is
// rate-limited (see routes/ai.routes.ts) because each call runs a slow,
// resource-heavy AI process that looks up reference material and writes a response.
export async function consult(req: Request, res: Response) {
  const consultation = await aiService.consultAI(req.body, req.user!.id)
  await auditService.logAction(req, req.user!.id, 'AI_CONSULTED', 'AiConsultation', consultation.id, {
    encounter: req.body.encounter,
  })
  return ok(res, consultation, 201)
}

// GET /ai/consultations?encounter= — requires 'ai.consult' (Doctor) or
// 'ai.analyzeVitals' (Nurse) (see ai.routes.ts's requireAnyPermission). A
// doctor sees every consultation on the encounter; a nurse without
// 'ai.consult' only sees their own NURSE_VITALS_ANALYSIS entries — never a
// doctor's own MANUAL consult questions on the same encounter.
export async function listForEncounter(req: Request, res: Response) {
  const encounterId = req.query.encounter
  const consultations = await aiService.listConsultationsForEncounter(encounterId as string, req.user!)
  return ok(res, consultations)
}

// POST /ai/consultations/:id/review — requires 'ai.review' (Doctor only).
export async function review(req: Request, res: Response) {
  const consultation = await aiService.reviewConsultation(
    req.params.id as string,
    req.user!.id,
    req.body.reviewStatus as AiReviewStatus,
    req.body.doctorComment,
  )
  await auditService.logAction(req, req.user!.id, 'AI_CONSULTATION_REVIEWED', 'AiConsultation', consultation.id, {
    reviewStatus: consultation.reviewStatus,
  })
  return ok(res, consultation)
}

// POST /ai/analyze-vitals — requires 'ai.analyzeVitals' (Nurse only).
export async function analyzeVitals(req: Request, res: Response) {
  const consultation = await aiService.analyzeVitalsForNurse(req.body.encounter, req.user!.id, req.body.notes)
  await auditService.logAction(req, req.user!.id, 'AI_CONSULTED', 'AiConsultation', consultation.id, {
    encounter: req.body.encounter,
  })
  return ok(res, consultation, 201)
}

// POST /ai/explain-lab-result — requires 'ai.explainLabResult' (Lab Tech only).
export async function explainLabResult(req: Request, res: Response) {
  const consultation = await aiService.explainLabResult(req.body.labResult, req.user!.id, req.body.notes)
  await auditService.logAction(req, req.user!.id, 'AI_CONSULTED', 'AiConsultation', consultation.id, {
    labResult: req.body.labResult,
  })
  return ok(res, consultation, 201)
}

// GET /ai/consultations/lab-order/:labOrder — requires 'ai.explainLabResult'.
// Batches every result's explanations for one order into a single call,
// instead of the lab order detail view firing one GET per result.
export async function listForLabOrder(req: Request, res: Response) {
  const consultations = await aiService.listConsultationsForLabOrder(req.params.labOrder as string)
  return ok(res, consultations)
}
