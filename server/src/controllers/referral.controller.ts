import type { Request, Response } from 'express'
import * as referralService from '../services/referral.service.js'
import * as auditService from '../services/audit.service.js'
import { ok } from '../utils/apiResponse.js'

// GET /referrals — requires 'referral.read' (Doctor only). Referrals sent
// TO the caller — the incoming worklist. A doctor's own outgoing referrals
// are visible on the encounter they came from instead (GET /encounters/:id
// — see encounter.service.ts's getEncounterById), not duplicated here.
export async function listMine(req: Request, res: Response) {
  const referrals = await referralService.listIncomingReferrals(req.user!.id)
  return ok(res, referrals)
}

// GET /referrals/sent — requires 'referral.read' (Doctor only). The mirror of
// listMine: referrals this doctor sent, rather than ones sent to them.
export async function listSent(req: Request, res: Response) {
  const referrals = await referralService.listOutgoingReferrals(req.user!.id)
  return ok(res, referrals)
}

// PATCH /referrals/:id/status — requires 'referral.update' (Doctor only,
// and only the doctor the referral was sent to).
export async function updateStatus(req: Request, res: Response) {
  const referral = await referralService.updateReferralStatus(req.params.id as string, req.user!.id, req.body.status)
  await auditService.logAction(req, req.user!.id, 'REFERRAL_STATUS_UPDATED', 'Referral', referral.id, {
    status: req.body.status,
  })
  return ok(res, referral)
}

// GET /referrals/:id/messages — requires 'referral.read'. Restricted at the
// service layer to the referral's own fromDoctor/toDoctor (see
// referral.service.ts's assertReferralParticipant), same as listMine only
// ever showing the caller's own worklist.
export async function listMessages(req: Request, res: Response) {
  const messages = await referralService.listReferralMessages(req.params.id as string, req.user!.id)
  return ok(res, messages)
}

// POST /referrals/:id/messages — requires 'referral.read' (not 'update' —
// sending a message doesn't change the referral's status). Same
// fromDoctor/toDoctor restriction as listMessages above.
export async function sendMessage(req: Request, res: Response) {
  const message = await referralService.sendReferralMessage(req.params.id as string, req.user!.id, req.body.body)
  await auditService.logAction(req, req.user!.id, 'REFERRAL_MESSAGE_SENT', 'Referral', req.params.id as string, {})
  return ok(res, message, 201)
}
