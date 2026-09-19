import { connectDB } from '../config/db.js'
import { Role } from '../models/Role.js'
import { User } from '../models/User.js'
import { hashPassword } from '../services/auth.service.js'
import { DEFAULT_ROLE_PERMISSIONS, ROLE_NAMES } from '../types/permissions.js'
import { logger } from './logger.js'
import { seedBulkClinicalData } from './bulkSeed.js'
import mongoose from 'mongoose'
import { fileURLToPath } from 'node:url'

// Run with `npm run seed` (see server/package.json). This is safe to run
// more than once: roles are created if missing or updated in place if they
// already exist, existing test accounts are left alone rather than
// duplicated or overwritten, and the bulk clinical data step (see
// bulkSeed.ts) skips itself entirely once it detects a realistic amount of
// data already exists.

// Shared password for all seeded test accounts — fine for a local dev/demo
// database, never use a fixed password like this in a real deployment.
const TEST_PASSWORD = 'Password123!'

// One demo login per role, so a full walkthrough of the app can be done by
// logging in and out as each of these accounts in turn. Each address is
// personalized to its own named account (firstname + role) rather than a
// generic shared role@sana.test address, so they read like real per-user
// logins rather than interchangeable role placeholders.
const TEST_ACCOUNTS: Array<{ email: string; role: (typeof ROLE_NAMES)[number]; firstName: string; lastName: string }> = [
  { email: 'amaadmin@sana.test', role: 'ADMIN', firstName: 'Ama', lastName: 'Admin' },
  { email: 'kwamedoc@sana.test', role: 'DOCTOR', firstName: 'Kwame', lastName: 'Doctor' },
  // A second doctor — needed for anything doctor-to-doctor (referrals and
  // their message threads). Kept here, not just as a one-off script, so a
  // fresh seed (or the Playwright e2e DB — see test/e2eServer.ts) never
  // loses it.
  { email: 'nanadoc@sana.test', role: 'DOCTOR', firstName: 'Nana', lastName: 'Yeboah' },
  { email: 'akosuanurse@sana.test', role: 'NURSE', firstName: 'Akosua', lastName: 'Nurse' },
  { email: 'kofipatient@sana.test', role: 'PATIENT', firstName: 'Kofi', lastName: 'Patient' },
  { email: 'yawlabtech@sana.test', role: 'LAB_TECH', firstName: 'Yaw', lastName: 'LabTech' },
  { email: 'efuapharm@sana.test', role: 'PHARMACIST', firstName: 'Efua', lastName: 'Pharmacist' },
]

// Roles + the named test accounts — the small, deterministic part of
// seeding. Exported separately from the CLI entry point below so
// test/e2eServer.ts can call just this (skipping seedBulkClinicalData's
// ~100s of randomized patients/appointments/encounters, which e2e specs
// don't need and which would make every Playwright run that much slower).
// Assumes the caller has already connected Mongoose.
export async function seedEssentials() {
  // Step 1: make sure all roles exist with the correct permission sets.
  // findOneAndUpdate with upsert:true means "create it if missing, otherwise
  // update its permissions to match the current DEFAULT_ROLE_PERMISSIONS."
  // That way, re-running the seed after editing permissions.ts keeps the
  // roles in the database in sync with the code.
  const roleIds: Record<string, string> = {}
  for (const name of ROLE_NAMES) {
    const role = await Role.findOneAndUpdate(
      { name },
      { name, permissions: DEFAULT_ROLE_PERMISSIONS[name] },
      { upsert: true, returnDocument: 'after' },
    )
    roleIds[name] = role.id
    logger.info(`Role ready: ${name} (${role.permissions.length} permissions)`)
  }

  // Step 2: create one test account per role, unless it already exists
  // (so re-running the seed doesn't reset passwords or duplicate accounts).
  for (const account of TEST_ACCOUNTS) {
    const existing = await User.findOne({ email: account.email })
    if (existing) {
      logger.info(`Test account already exists: ${account.email}`)
      continue
    }
    await User.create({
      email: account.email,
      passwordHash: await hashPassword(TEST_PASSWORD),
      firstName: account.firstName,
      lastName: account.lastName,
      role: roleIds[account.role],
      status: 'ACTIVE',
    })
    logger.info(`Created test account: ${account.email} / ${TEST_PASSWORD}`)
  }
}

async function seed() {
  await connectDB()

  await seedEssentials()

  // Step 3: generate realistic bulk demo data (patients, extra doctors and
  // nurses, appointments, encounters, lab orders) — see bulkSeed.ts.
  await seedBulkClinicalData()

  // The seed script runs once and exits (unlike the actual server, which
  // keeps running), so the database connection is closed cleanly here
  // instead of being left open.
  await mongoose.disconnect()
  logger.info('Seed complete.')
}

// Only run the CLI entry point when this file is executed directly (`tsx
// src/utils/seed.ts` / `npm run seed`) — NOT merely imported. Without this
// guard, test/e2eServer.ts's `import { seedEssentials } from './seed.js'`
// would also evaluate this module's top level and kick off a second,
// concurrent seed() run racing against e2eServer's own seedEssentials()
// call — exactly what caused a duplicate-key crash on User.create the first
// time this shipped.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seed().catch((err) => {
    logger.error('Seed failed', err)
    process.exit(1)
  })
}
