import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose'

// A doctor's request to loop another doctor in on a patient — a specialist
// opinion, a second opinion, or a handoff — without stepping outside the
// system. Scoped to one Encounter, the same "sub-record owned by the
// assigned doctor" pattern Diagnosis already uses, plus fromDoctor/toDoctor
// so it can also be looked up cross-encounter as "referrals sent to me"
// (see referral.service.ts's listIncomingReferrals) — the one thing that
// makes a referral different from a diagnosis: the whole point is
// surfacing it to someone who wasn't already looking at this encounter.
export const REFERRAL_STATUSES = ['PENDING', 'ACKNOWLEDGED', 'COMPLETED'] as const
export type ReferralStatus = (typeof REFERRAL_STATUSES)[number]

const referralSchema = new Schema(
  {
    encounter: { type: Schema.Types.ObjectId, ref: 'Encounter', required: true },
    patient: { type: Schema.Types.ObjectId, ref: 'Patient', required: true },
    fromDoctor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    toDoctor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, required: true, trim: true },
    notes: { type: String, trim: true },
    status: { type: String, enum: REFERRAL_STATUSES, default: 'PENDING' },
  },
  // Unlike Diagnosis, this DOES track updatedAt — a referral's whole
  // lifecycle (PENDING -> ACKNOWLEDGED -> COMPLETED) is status changing
  // over time, not a one-shot record with occasional corrections.
  { timestamps: true },
)

// Powers "referrals sent to me" (the incoming worklist, filterable by
// status) and "referrals on this encounter" (shown on the encounter page).
referralSchema.index({ toDoctor: 1, status: 1 })
referralSchema.index({ encounter: 1 })

export type ReferralAttrs = InferSchemaType<typeof referralSchema>
export type ReferralDoc = HydratedDocument<ReferralAttrs>
export const Referral = model<ReferralAttrs>('Referral', referralSchema)
