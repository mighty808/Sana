// Every permission string the system understands. Adding a new protected
// action anywhere in the app means adding its permission string here first,
// then assigning it to whichever role(s) should have it below.
export const PERMISSIONS = [
  'user.manage',
  'user.readDoctors',
  'patient.create',
  'patient.read',
  'patient.update',
  'appointment.create',
  'appointment.read',
  'appointment.update',
  'encounter.create',
  'encounter.read',
  'encounter.complete',
  'vitals.create',
  'vitals.update',
  'vitals.delete',
  'diagnosis.create',
  'diagnosis.update',
  'diagnosis.delete',
  'referral.create',
  'referral.read',
  'referral.update',
  'prescription.create',
  'prescription.read',
  'prescription.dispense',
  'laborder.create',
  'laborder.update',
  'laborder.delete',
  'laborder.read',
  'labresult.create',
  'labresult.release',
  'labresult.read',
  'ai.consult',
  'ai.review',
  'ai.analyzeVitals',
  'ai.explainLabResult',
  'invoice.create',
  'invoice.read',
  'payment.create',
  'notification.read',
  // Admin-only oversight of every notification sent to every user — same
  // "personal vs. system-wide" split as analytics.read/analytics.readTrends
  // below.
  'notification.readAll',
  'analytics.read',
  'analytics.readTrends',
  'auditlog.read',
] as const

// TypeScript union type derived from the array above, e.g. 'user.manage' | 'patient.create' | ...
// Using `as const` means every permission added to the array above is
// automatically added to this type too, everywhere it's used (the rbac
// middleware, the validation schemas, and so on).
export type Permission = (typeof PERMISSIONS)[number]

// The 6 roles this system supports. LAB_TECH and PHARMACIST are each their
// own role, separate from Admin, so that lab work and pharmacy work each
// have a dedicated owner instead of being one more thing Admin is
// responsible for.
export const ROLE_NAMES = ['ADMIN', 'DOCTOR', 'NURSE', 'PATIENT', 'LAB_TECH', 'PHARMACIST'] as const
export type RoleName = (typeof ROLE_NAMES)[number]

// The default permission set assigned to each role when the database is seeded
// (see utils/seed.ts). This is the single source of truth for "who can do what"
// — change it here to change what a role is allowed to do system-wide.
export const DEFAULT_ROLE_PERMISSIONS: Record<RoleName, Permission[]> = {
  // Admin is a supervisor role, not a clinical or front-desk one. Admin
  // manages user accounts, invoices, and the audit log, and can read
  // everything else (patients, appointments, encounters, labs) to keep an
  // eye on the whole system. Admin does not register patients or book
  // appointments — that's Nurse's job, below — and does not enter or
  // release lab results — that's Lab Tech's job. Admin can also browse the
  // full list of encounters, since a supervisor with no visibility into
  // the clinical workflow's central record would be an odd gap.
  ADMIN: [
    'user.manage',
    'patient.read',
    'patient.update',
    'appointment.read',
    'appointment.update',
    'encounter.read',
    'invoice.create',
    'invoice.read',
    'payment.create',
    'laborder.read',
    'labresult.read',
    // Read-only oversight of the pharmacy queue, the same shape as the
    // 'laborder.read'/'labresult.read' oversight above — Admin sees every
    // prescription but never writes or dispenses one. This was missing
    // while three separate places already assumed Admin had it:
    // navItems.ts lists Prescriptions under Admin's nav,
    // prescription.service.ts's listPrescriptions deliberately leaves
    // Admin unscoped, and PrescriptionsPage.tsx's seesEveryPrescription
    // treats Admin like the Pharmacist. Without the grant, Admin's nav
    // link was filtered out and /prescriptions 403'd them.
    'prescription.read',
    'notification.read',
    'notification.readAll',
    'analytics.read',
    // Hospital-wide trend data (revenue, appointment volume, lab
    // turnaround) — its own permission rather than folding it into
    // 'analytics.read', which every role holds just for their own small
    // per-role dashboard summary (see analytics.service.ts's
    // getDashboard). Reusing that broad permission here would expose
    // hospital-wide revenue/volume to every role instead of just the
    // supervisor one. Same reasoning as Nurse's 'ai.analyzeVitals' below.
    'analytics.readTrends',
    'auditlog.read',
  ],
  // Doctor continues a clinical encounter that a Nurse already opened,
  // orders and reviews labs, and is the only role that can ask Sana AI a
  // free-text question and review its answers. A doctor can't book an
  // appointment or open an encounter — those are front-desk, check-in
  // actions that Nurse handles, not something a doctor starts themselves.
  // A doctor can, however, correct their own diagnosis or lab order while
  // the encounter is still open (see encounter.service.ts's
  // updateDiagnosis and labOrder.service.ts's updateLabOrder for exactly
  // how that's restricted to their own encounter, and only while it's open).
  DOCTOR: [
    'patient.read',
    'appointment.read',
    'appointment.update',
    'encounter.read',
    'encounter.complete',
    'diagnosis.create',
    'diagnosis.update',
    'diagnosis.delete',
    // Referring a patient to another doctor — its own permission set (not
    // folded into diagnosis.create/update) since a referral is a different
    // kind of action with a different lifecycle (PENDING -> ACKNOWLEDGED ->
    // COMPLETED, and it can be acted on by someone other than the doctor
    // who created it — see referral.service.ts). 'referral.read' covers
    // only the incoming worklist (GET /referrals) — a referral shown on the
    // encounter it came from rides along on 'encounter.read' instead, the
    // same way a Diagnosis has no read permission of its own.
    'referral.create',
    'referral.read',
    'referral.update',
    // Writing a prescription on their own open encounter ('.create'), and
    // seeing their own prescriptions both on the encounter they came from
    // (rides along on 'encounter.read', same as Referral/Diagnosis) and
    // across encounters via GET /prescriptions ('.read'). A doctor never
    // dispenses — that's Pharmacist's job below, via '.dispense'.
    'prescription.create',
    'prescription.read',
    // Needed to populate the "refer to" doctor picker (GET /users/doctors)
    // — previously Nurse-only for the appointment-booking picker, but the
    // permission's own purpose ("list doctor accounts") is generic, and a
    // referral needs the exact same list.
    'user.readDoctors',
    'laborder.create',
    'laborder.update',
    'laborder.delete',
    'laborder.read',
    'labresult.read',
    'ai.consult',
    'ai.review',
    'notification.read',
    'analytics.read',
  ],
  // Nurse is the front-desk, front-line role. A nurse registers a patient
  // when they physically arrive ('patient.create'), books their
  // appointment and picks which doctor it's with (since a nurse has no
  // doctor identity of her own — see appointment.service.ts's
  // createAppointment), and checks them in ('appointment.update'; there's
  // no strict rule about which status can follow which — anyone with the
  // permission can set any status). A nurse also opens the encounter and
  // records the required vitals ('encounter.create', 'vitals.create',
  // 'vitals.update' — the update permission lets her fix a vitals entry
  // while the encounter is still open, see encounter.service.ts's
  // updateVitals). The doctor then continues clinical work on that same
  // encounter rather than a new one being created (see the
  // Appointment.encounter link back in models/Appointment.ts). A nurse
  // still can't add a diagnosis or order a lab test — those stay doctor actions.
  NURSE: [
    'patient.create',
    'patient.read',
    'appointment.create',
    'appointment.read',
    'appointment.update',
    'encounter.create',
    'encounter.read',
    'vitals.create',
    'vitals.update',
    'vitals.delete',
    // Read-only visibility into lab orders — needed so the Encounter
    // page's Lab Results section (GET /lab-orders?encounter=) actually
    // loads for a nurse, not just a doctor/admin/lab tech. A nurse still
    // can't order a test or enter/release a result — those stay doctor/lab
    // tech actions.
    'laborder.read',
    // A nurse needs to list doctor accounts for the appointment-booking
    // picker, so that's its own permission ('user.readDoctors') instead of
    // being bundled into 'appointment.create'. Bundling it in would only
    // work by coincidence, since reading the list of doctors has nothing
    // to do with creating an appointment — it just happens that nurse is
    // currently the only role that needs both.
    'user.readDoctors',
    // A nurse can ask Sana AI to look at the vitals and chief complaint
    // she just recorded, before the doctor even opens the encounter. This
    // is its own permission rather than reusing 'ai.consult' (the
    // doctor's free-text question permission), because granting
    // 'ai.consult' would also open up the general /ai/consult endpoint to
    // any question a nurse wants to type — a much bigger surface than one
    // fixed "analyze these vitals" button.
    'ai.analyzeVitals',
    'notification.read',
    'analytics.read',
  ],
  // Patient gets read-only access to their own appointments, results, and
  // invoices. This list only controls which *types* of thing a patient
  // can read at all — actually limiting them to their *own* records
  // happens separately, in the service layer. 'analytics.read' is here
  // too, because GET /analytics/dashboard is one shared endpoint that
  // gives every role their own summary — for a patient, that's their
  // upcoming appointments, unread notifications, and outstanding balance.
  PATIENT: [
    'appointment.read',
    'labresult.read',
    'invoice.read',
    // Their own prescription history — same read-only, own-records-only
    // shape as labresult.read/invoice.read above (the service layer scopes
    // it down to just their own patient record, same as everything else here).
    'prescription.read',
    'notification.read',
    'analytics.read',
  ],
  // Lab Tech runs the lab queue from start to finish: sees which tests
  // have been ordered, enters the results, and releases them straight to
  // the patient, with no separate Admin approval step in between. A lab
  // tech doesn't order tests themselves — that's still the doctor's job,
  // via 'laborder.create' — and has no access to patients, appointments,
  // or anything else outside the lab workflow. 'invoice.read' lets the lab
  // order detail view show whether that order's invoice has been paid.
  // 'invoice.create' lets the lab tech bill the order themselves, right
  // after the doctor requests it, instead of waiting for an Admin to pick
  // it up later from the Invoices page — Admin can still create invoices too.
  LAB_TECH: [
    'laborder.read',
    'labresult.create',
    'labresult.release',
    'labresult.read',
    'invoice.create',
    'invoice.read',
    // Same reasoning as Nurse's 'ai.analyzeVitals' above: a lab tech can
    // ask Sana AI to explain one specific test result in plain terms,
    // through its own narrow permission rather than the doctor-only 'ai.consult'.
    'ai.explainLabResult',
    'notification.read',
    'analytics.read',
  ],
  // Pharmacist runs the pharmacy queue: sees every prescription written,
  // dispenses it (a single atomic action — see models/Prescription.ts's
  // comment on why this doesn't split into two collections the way
  // LabOrder/LabResult does), and bills it, the same "own workflow, own
  // billing" shape LAB_TECH already has for labs. A pharmacist never
  // writes a prescription themselves — that's still the doctor's job, via
  // 'prescription.create' — and has no access to patients, appointments,
  // or anything outside the pharmacy workflow.
  PHARMACIST: [
    'prescription.read',
    'prescription.dispense',
    'invoice.create',
    'invoice.read',
    'notification.read',
    'analytics.read',
  ],
}
