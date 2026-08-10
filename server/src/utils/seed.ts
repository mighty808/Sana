import { connectDB } from '../config/db.js'
import { Role } from '../models/Role.js'
import { User } from '../models/User.js'
import { hashPassword } from '../services/auth.service.js'
import { DEFAULT_ROLE_PERMISSIONS, ROLE_NAMES } from '../types/permissions.js'
import { logger } from './logger.js'
import mongoose from 'mongoose'

// Run with `npm run seed` (see server/package.json). Idempotent — safe to run
// multiple times: roles are upserted (created or updated in place) and
// existing test accounts are skipped rather than duplicated or overwritten.
// Phase 11 will extend this same script with realistic bulk patient/appointment data.

// Shared password for all seeded test accounts — fine for a local dev/demo
// database, never use a fixed password like this in a real deployment.
const TEST_PASSWORD = 'Password123!'

// One demo login per role, so the whole demo script (blueprint section 10.1)
// can be walked through by logging in/out as each of these accounts.
const TEST_ACCOUNTS: Array<{ email: string; role: (typeof ROLE_NAMES)[number]; firstName: string; lastName: string }> = [
  { email: 'admin@sana.test', role: 'ADMIN', firstName: 'Ama', lastName: 'Admin' },
  { email: 'doctor@sana.test', role: 'DOCTOR', firstName: 'Kwame', lastName: 'Doctor' },
  { email: 'nurse@sana.test', role: 'NURSE', firstName: 'Akosua', lastName: 'Nurse' },
  { email: 'patient@sana.test', role: 'PATIENT', firstName: 'Kofi', lastName: 'Patient' },
]

async function seed() {
  await connectDB()

  // Step 1: make sure all 4 roles exist with the correct permission sets.
  // findOneAndUpdate with upsert:true means "create it if missing, otherwise
  // update its permissions to match the current DEFAULT_ROLE_PERMISSIONS" —
  // so re-running the seed after editing permissions.ts keeps roles in sync.
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

  // The seed script is a one-off run (not the long-lived server process), so
  // close the DB connection cleanly when done instead of leaving it open.
  await mongoose.disconnect()
  logger.info('Seed complete.')
}

seed().catch((err) => {
  logger.error('Seed failed', err)
  process.exit(1)
})
