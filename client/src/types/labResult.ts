export const LAB_RESULT_STATUSES = ['ENTERED', 'RELEASED'] as const
export type LabResultStatus = (typeof LAB_RESULT_STATUSES)[number]

export const LAB_RESULT_INTERPRETATIONS = ['NORMAL', 'ABNORMAL', 'CRITICAL'] as const
export type LabResultInterpretation = (typeof LAB_RESULT_INTERPRETATIONS)[number]

// listLabResults() returns raw LabResult documents with no .populate() at
// all (see labResult.service.ts) — `patient`/`labOrder`/`performedBy` are
// always plain id strings here, never populated objects, unlike LabOrder's
// own patient/doctor fields. There's genuinely no patient name available
// on this list without a separate lookup the backend doesn't offer.
export interface LabResult {
  _id: string
  labOrder: string
  patient: string
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
