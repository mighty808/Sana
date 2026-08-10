import type { Request, Response } from 'express'
import * as aiService from '../services/ai.service.js'
import * as auditService from '../services/audit.service.js'
import { ok } from '../utils/apiResponse.js'
import type { AiReviewStatus } from '../models/AiConsultation.js'

// POST /ai/consult — requires 'ai.consult' (Doctor only), rate-limited
// (see routes/ai.routes.ts) since each call is an expensive RAG pipeline run.
export async function consult(req: Request, res: Response) {
  const consultation = await aiService.consultAI(req.body, req.user!.id)
  await auditService.logAction(req, req.user!.id, 'AI_CONSULTED', 'AiConsultation', consultation.id, {
    encounter: req.body.encounter,
  })
  return ok(res, consultation, 201)
}

// GET /ai/consultations?encounter= — requires 'ai.consult' (only a doctor
// consults AI, so only a doctor has any consultations to list).
export async function listForEncounter(req: Request, res: Response) {
  const encounterId = req.query.encounter
  const consultations = await aiService.listConsultationsForEncounter(encounterId as string)
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
