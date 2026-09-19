export const LAB_RESULT_STATUSES = ['ENTERED', 'RELEASED'] as const
export type LabResultStatus = (typeof LAB_RESULT_STATUSES)[number]

export const LAB_RESULT_INTERPRETATIONS = ['NORMAL', 'ABNORMAL', 'CRITICAL'] as const
export type LabResultInterpretation = (typeof LAB_RESULT_INTERPRETATIONS)[number]

import type { Patient } from './patient'

// listLabResults() fills in `patient` (see labResult.service.ts), the same
// way LabOrder's own patient field always is. `labOrder` and `performedBy`
// stay as plain id strings, because nothing that uses this list needs them
// filled in.
export interface LabResult {
  _id: string
  labOrder: string
  patient: Patient
  performedBy: string
  testName: string
  resultValue: string
  unit?: string
  referenceRange?: string
  interpretation?: LabResultInterpretation
  notes?: string
  resultedAt: string
  status: LabResultStatus
  releasedBy?: string
  releasedAt?: string
}
