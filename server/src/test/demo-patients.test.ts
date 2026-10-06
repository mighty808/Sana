// Covers the default demo dataset (utils/demoPatients.ts): five complete
// patients, one tied to the patient login, created once and never duplicated.
import { Patient } from '../models/Patient.js'
import { User } from '../models/User.js'
import { seedEssentials } from '../utils/seed.js'
import { seedDemoPatients } from '../utils/demoPatients.js'
import { connectTestDb, disconnectTestDb, DB_BOOT_TIMEOUT_MS } from './setupTestDb.js'

beforeAll(connectTestDb, DB_BOOT_TIMEOUT_MS)
afterAll(disconnectTestDb, DB_BOOT_TIMEOUT_MS)

describe('seedDemoPatients', () => {
  test('creates five patients with every detail filled in', async () => {
    // The patient login has to exist first — one demo patient is linked to it.
    await seedEssentials()
    await seedDemoPatients()

    const patients = await Patient.find().sort({ patientNumber: 1 })
    expect(patients).toHaveLength(5)
    for (const p of patients) {
      expect(p.dob).toBeInstanceOf(Date)
      expect(p.phone).toMatch(/^0\d{9}$/)
      expect(p.email).toBeTruthy()
      expect(p.address).toBeTruthy()
      expect(p.bloodGroup).not.toBe('UNKNOWN')
      expect(p.emergencyContact?.name).toBeTruthy()
      expect(p.emergencyContact?.phone).toMatch(/^0\d{9}$/)
    }
  })

  test("links Kofi Patient's record to the kofipatient@sana.test login", async () => {
    const login = await User.findOne({ email: 'kofipatient@sana.test' })
    const linked = await Patient.find({ user: login!._id })
    expect(linked).toHaveLength(1)
    expect(`${linked[0]!.firstName} ${linked[0]!.lastName}`).toBe('Kofi Patient')
  })

  test('running it again does not duplicate anyone', async () => {
    await seedDemoPatients()
    expect(await Patient.countDocuments()).toBe(5)
  })
})
