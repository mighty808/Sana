import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose'

// One message in the conversation thread attached to a single Referral —
// the same "sub-record owned by its parent" pattern Diagnosis/VitalSign use
// for Encounter. Scoped to exactly the two doctors on that referral
// (fromDoctor/toDoctor — enforced in referral.service.ts's
// assertReferralParticipant, not here), so unlike Referral itself this
// never needs to be looked up cross-referral.
const referralMessageSchema = new Schema(
  {
    referral: { type: Schema.Types.ObjectId, ref: 'Referral', required: true },
    sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true, trim: true, maxlength: 2000 },
  },
  // No updatedAt — a chat message is never edited after being sent, only
  // ever appended to the thread.
  { timestamps: { createdAt: true, updatedAt: false } },
)

// The only query this ever needs: every message on one referral, oldest
// first, for rendering the thread top-to-bottom.
referralMessageSchema.index({ referral: 1, createdAt: 1 })

export type ReferralMessageAttrs = InferSchemaType<typeof referralMessageSchema>
export type ReferralMessageDoc = HydratedDocument<ReferralMessageAttrs>
export const ReferralMessage = model<ReferralMessageAttrs>('ReferralMessage', referralMessageSchema)
