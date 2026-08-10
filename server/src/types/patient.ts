// Single source of truth for the patient blood-group enum, following the
// same "one array, derive everything else" pattern already used in
// types/permissions.ts (PERMISSIONS array -> Permission type). Previously
// these values were hand-duplicated in three places (the Mongoose schema,
// the Zod validation schema, and a manually-written TS type) which could
// silently drift out of sync if a value was added/removed in only one spot.
export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'UNKNOWN'] as const

export type BloodGroup = (typeof BLOOD_GROUPS)[number]
