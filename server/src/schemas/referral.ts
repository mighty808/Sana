import { z } from 'zod'
import { REFERRAL_STATUSES } from '../models/Referral.js'

// Validates POST /encounters/:id/referrals request bodies. `toDoctor` is
// the other doctor's User ObjectId — the encounter itself (and its
// patient/fromDoctor) comes from the :id route param and the authenticated
// caller, the same way addDiagnosisSchema doesn't ask for `encounter` or
// `doctor` either.
export const createReferralSchema = z.object({
  toDoctor: z.string().min(1),
  reason: z.string().trim().min(1),
  notes: z.string().trim().optional(),
})

// Validates PATCH /referrals/:id/status request bodies.
export const updateReferralStatusSchema = z.object({
  status: z.enum(REFERRAL_STATUSES),
})

// Validates POST /referrals/:id/messages request bodies. Max length matches
// the ReferralMessage model's own `body` maxlength.
export const sendReferralMessageSchema = z.object({
  body: z.string().trim().min(1).max(2000),
})
