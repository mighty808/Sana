import { Patient } from '../models/Patient.js'
import { User } from '../models/User.js'
import { createPatient } from '../services/patient.service.js'
import { logger } from '../utils/logger.js'

// Baseline demo patients for Playwright runs ONLY — deliberately not part of
// seed.ts's seedEssentials(), because that also runs against the real Atlas
// database via `npm run seed`. E2E specs get a small, deterministic set of
// patients they can list, search and open without having to create one first.
//
// These five are a READ-ONLY baseline. Any spec that mutates a patient (opens
// an encounter on them, bills them, orders labs) must create its own tagged
// patient instead — two specs mutating the same seeded patient in parallel is
// exactly the flake the tagging rule in e2e/fixtures/api.ts exists to prevent.

// Fixed, not randomized: specs assert against these names directly.
const DEMO_PATIENTS = [
  {
    firstName: 'Ama',
    lastName: 'Boateng',
    dob: new Date('1988-03-14'),
    gender: 'FEMALE' as const,
    phone: '0244000101',
    email: 'ama.boateng@example.test',
    address: 'Osu, Accra',
    bloodGroup: 'O+' as const,
    emergencyContact: { name: 'Kojo Boateng', phone: '0244000102' },
  },
  {
    firstName: 'Kwabena',
    lastName: 'Mensah',
    dob: new Date('1975-11-02'),
    gender: 'MALE' as const,
    phone: '0244000201',
    email: 'kwabena.mensah@example.test',
    address: 'Asokwa, Kumasi',
    bloodGroup: 'A+' as const,
    emergencyContact: { name: 'Akua Mensah', phone: '0244000202' },
  },
  {
    firstName: 'Adjoa',
    lastName: 'Owusu',
    dob: new Date('2001-07-22'),
    gender: 'FEMALE' as const,
    phone: '0244000301',
    email: 'adjoa.owusu@example.test',
    address: 'East Legon, Accra',
    bloodGroup: 'B-' as const,
    emergencyContact: { name: 'Yaw Owusu', phone: '0244000302' },
  },
  {
    firstName: 'Kofi',
    lastName: 'Asante',
    dob: new Date('1960-01-30'),
    gender: 'MALE' as const,
    phone: '0244000401',
    email: 'kofi.asante@example.test',
    address: 'Bantama, Kumasi',
    bloodGroup: 'AB+' as const,
    emergencyContact: { name: 'Abena Asante', phone: '0244000402' },
  },
  {
    firstName: 'Efua',
    lastName: 'Darko',
    dob: new Date('1993-09-10'),
    gender: 'FEMALE' as const,
    phone: '0244000501',
    email: 'efua.darko@example.test',
    address: 'Dansoman, Accra',
    bloodGroup: 'O-' as const,
    emergencyContact: { name: 'Nii Darko', phone: '0244000502' },
  },
]

// The seeded PATIENT-role login. Its Patient record is what the patient
// portal reads through, so one of the five above gets linked to it below.
const PATIENT_PORTAL_LOGIN = 'kofipatient@sana.test'

// Assumes the caller has already connected Mongoose and run seedEssentials()
// (the User accounts must exist before the link below can be made).
export async function seedE2EPatients() {
  // Goes through the real createPatient() service rather than Patient.create
  // directly, so patientNumber comes from the actual generateId('SAN')
  // sequence — e2e data is then indistinguishable from data the app itself
  // would have produced.
  const created = []
  for (const input of DEMO_PATIENTS) {
    created.push(await createPatient(input))
  }

  // Without this link the PATIENT role's own pages ("My Results", "My
  // Invoices", "My Appointments") resolve to nothing at all — they look the
  // patient up through Patient.user, not through the User record. The real
  // seed does this in bulkSeed.ts, which e2e deliberately skips for speed,
  // so it has to be done here instead.
  const patientUser = await User.findOne({ email: PATIENT_PORTAL_LOGIN })
  if (patientUser) {
    // Kofi Asante — same first name as the login's own "Kofi Patient", which
    // keeps the portal reading coherently for anyone watching a headed run.
    const linked = created[3]!
    await Patient.updateOne({ _id: linked.id }, { user: patientUser._id })
    logger.info(`[e2e] Linked ${PATIENT_PORTAL_LOGIN} to patient ${linked.patientNumber}`)
  } else {
    logger.warn(`[e2e] ${PATIENT_PORTAL_LOGIN} not found — patient portal specs will have no data`)
  }

  logger.info(`[e2e] Seeded ${created.length} demo patients`)
}
