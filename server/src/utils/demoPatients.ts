import type { BloodGroup } from '../types/patient.js'
import { Patient } from '../models/Patient.js'
import { User } from '../models/User.js'
import { generateId } from './generateId.js'
import { logger } from './logger.js'

// A small, fixed set of fully filled-in patients — the default demo data.
// Unlike the randomised bulk seed (bulkSeed.ts, now opt-in via `--bulk`), these
// are the same five people every time, with every field the Patient record
// supports filled in (contact details, blood group, emergency contact), so a
// walkthrough has realistic records to open instead of thin placeholders.
//
// The first one is Kofi Patient, whose record is linked to the
// kofipatient@sana.test login: the patient portal only shows a patient the
// records whose `patient.user` matches the logged-in account, so without this
// link that login would see an empty portal.

interface DemoPatient {
  firstName: string
  lastName: string
  dob: string // ISO date, so the birth date is explicit rather than random
  gender: 'MALE' | 'FEMALE'
  phone: string
  address: string
  bloodGroup: BloodGroup
  emergencyContact: { name: string; phone: string }
  // Set only for the patient whose record belongs to a login account.
  linkedLoginEmail?: string
}

const DEMO_PATIENTS: DemoPatient[] = [
  {
    firstName: 'Kofi',
    lastName: 'Patient',
    dob: '1988-03-14',
    gender: 'MALE',
    phone: '0244120001',
    address: '14 Ring Road East, Osu, Accra',
    bloodGroup: 'O+',
    emergencyContact: { name: 'Abena Patient', phone: '0244120002' },
    linkedLoginEmail: 'kofipatient@sana.test',
  },
  {
    firstName: 'Abena',
    lastName: 'Mensah',
    dob: '1995-07-22',
    gender: 'FEMALE',
    phone: '0201230003',
    address: '7 Adum Street, Kumasi',
    bloodGroup: 'A+',
    emergencyContact: { name: 'Kwesi Mensah', phone: '0201230004' },
  },
  {
    firstName: 'Yaw',
    lastName: 'Owusu',
    dob: '1972-11-05',
    gender: 'MALE',
    phone: '0276540005',
    address: '22 Community 4, Tema',
    bloodGroup: 'B+',
    emergencyContact: { name: 'Afia Owusu', phone: '0276540006' },
  },
  {
    firstName: 'Akua',
    lastName: 'Darko',
    dob: '2001-01-30',
    gender: 'FEMALE',
    phone: '0555670007',
    address: '3 Commercial Street, Cape Coast',
    bloodGroup: 'AB+',
    emergencyContact: { name: 'Nana Darko', phone: '0555670008' },
  },
  {
    firstName: 'Kwabena',
    lastName: 'Addo',
    dob: '1958-09-09',
    gender: 'MALE',
    phone: '0507890009',
    address: '41 Market Circle, Takoradi',
    bloodGroup: 'O-',
    emergencyContact: { name: 'Esi Addo', phone: '0507890010' },
  },
]

// Creates any of the five that don't already exist, so re-running it never
// duplicates them. "Already exists" is decided by the phone number (unique to
// each person above), or — for the one tied to a login — by the login link.
// Assumes the caller has already connected Mongoose.
export async function seedDemoPatients() {
  for (const demo of DEMO_PATIENTS) {
    const loginUser = demo.linkedLoginEmail ? await User.findOne({ email: demo.linkedLoginEmail }) : null

    const existing = loginUser
      ? await Patient.findOne({ $or: [{ user: loginUser._id }, { phone: demo.phone }] })
      : await Patient.findOne({ phone: demo.phone })
    if (existing) {
      logger.info(`Demo patient already exists: ${demo.firstName} ${demo.lastName}`)
      continue
    }

    const patient = await Patient.create({
      patientNumber: await generateId('SAN'),
      firstName: demo.firstName,
      lastName: demo.lastName,
      dob: new Date(demo.dob),
      gender: demo.gender,
      phone: demo.phone,
      // The linked patient shares their login's email; the rest get a simple
      // address derived from their name, like a real registration would have.
      email: loginUser ? loginUser.email : `${demo.firstName}.${demo.lastName}@example.com`.toLowerCase(),
      address: demo.address,
      bloodGroup: demo.bloodGroup,
      emergencyContact: demo.emergencyContact,
      ...(loginUser ? { user: loginUser._id } : {}),
    })
    logger.info(`Created demo patient: ${patient.patientNumber} ${demo.firstName} ${demo.lastName}`)
  }
}
