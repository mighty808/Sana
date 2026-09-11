import type { Patient } from './patient'
import type { AppointmentDoctorRef } from './appointment'

// Matches server/src/models/Referral.ts's REFERRAL_STATUSES exactly.
export const REFERRAL_STATUSES = ['PENDING', 'ACKNOWLEDGED', 'COMPLETED'] as const
export type ReferralStatus = (typeof REFERRAL_STATUSES)[number]

// `patient`/`fromDoctor`/`toDoctor` come back either as the full populated
// object or just the raw id string, depending on which endpoint returned
// this — GET /encounters/:id populates all three (see encounter.service.ts's
// getEncounterById), while GET /referrals only populates patient and
// fromDoctor (toDoctor is always the caller). Same isPopulated() pattern
// every other ref field in this app already uses (see lib/utils.ts).
export interface Referral {
  _id: string
  encounter: string
  patient: Patient | string
  fromDoctor: AppointmentDoctorRef | string
  toDoctor: AppointmentDoctorRef | string
  reason: string
  notes?: string
  status: ReferralStatus
  createdAt: string
  updatedAt: string
}

// One message in a referral's conversation thread. `sender` is always
// populated by GET /referrals/:id/messages (see referral.service.ts's
// listReferralMessages), but typed as possibly-a-string too for the same
// reason every other ref field in this app is — the shape after an
// optimistic cache update (see useReferralMessagesLiveUpdate) may not have
// gone through the same populate.
export interface ReferralMessage {
  _id: string
  referral: string
  sender: AppointmentDoctorRef | string
  body: string
  createdAt: string
}
