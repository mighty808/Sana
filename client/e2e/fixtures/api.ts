import type { APIRequestContext, APIResponse } from '@playwright/test'
import { E2E_API_ORIGIN } from './ports'

// Talks to the backend directly (not through the Vite proxy) — the standard
// Playwright pattern of using raw API calls to set up fixture data quickly,
// saving UI-driven flows for the actual behaviour under test. Points at the
// same ephemeral e2e server the browser tests hit (see
// server/src/test/e2eServer.ts) — never the real Atlas dev database.
const API = `${E2E_API_ORIGIN}/api/v1`

const TEST_PASSWORD = 'Password123!'

// The seeded logins (server/src/utils/seed.ts's TEST_ACCOUNTS, also in
// TEST_LOGINS.md). Keyed by the same role names auth.setup.ts saves state
// under, so a spec and its fixtures always mean the same person.
export const ACCOUNTS = {
  admin: 'amaadmin@sana.test',
  doctorA: 'kwamedoc@sana.test',
  doctorB: 'nanadoc@sana.test',
  nurse: 'akosuanurse@sana.test',
  patient: 'kofipatient@sana.test',
  labtech: 'yawlabtech@sana.test',
  pharmacist: 'efuapharm@sana.test',
} as const

export type RoleKey = keyof typeof ACCOUNTS

// ---------------------------------------------------------------------------
// Isolation
// ---------------------------------------------------------------------------

// Every spec file in a run shares ONE ephemeral database (the e2e server boots
// a single Mongo instance per `npx playwright test`), and Playwright runs spec
// files in parallel. So nothing may assume it owns the data: no global counts,
// no "the only row", no bare badge numbers. Instead every factory below stamps
// this tag into a human-visible field, and specs find their own row by it.
//
// This isn't theoretical — an appointment-slot collision and a "Referrals2"
// badge assertion both failed for exactly this reason while building the first
// three specs.
export function uniqueTag(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

// ---------------------------------------------------------------------------
// Plumbing
// ---------------------------------------------------------------------------

// A non-2xx response would otherwise silently yield `{ error: {...} }.data ===
// undefined`, which then surfaces many calls later as a confusing "Cannot read
// properties of undefined" far from the actual cause. Failing loudly here, with
// the server's own error message, points straight at the real problem.
async function expectOk(res: APIResponse) {
  const body = await res.json()
  if (!res.ok()) {
    throw new Error(`${res.url()} -> ${res.status()}: ${JSON.stringify(body)}`)
  }
  return body.data
}

// Access tokens last 15 minutes (env.jwtAccessExpiresIn), and a full suite run
// makes a lot of factory calls — so tokens are reused rather than re-minted per
// call, with a conservative refresh well inside that window.
const TOKEN_TTL_MS = 10 * 60 * 1000
const tokenCache = new Map<string, { token: string; mintedAt: number }>()

export async function loginAs(request: APIRequestContext, email: string, password = TEST_PASSWORD) {
  const cached = tokenCache.get(email)
  if (cached && Date.now() - cached.mintedAt < TOKEN_TTL_MS) return cached.token

  const data = await expectOk(await request.post(`${API}/auth/login`, { data: { email, password } }))
  const token = data.accessToken as string
  tokenCache.set(email, { token, mintedAt: Date.now() })
  return token
}

async function authHeaders(request: APIRequestContext, role: RoleKey) {
  return { Authorization: `Bearer ${await loginAs(request, ACCOUNTS[role])}` }
}

// A role's real permission list, straight from its own login response (the
// backend populates Role.permissions onto the user it returns). Reading it at
// runtime rather than hard-coding it means the RBAC matrix spec can't silently
// rot when a permission is granted or revoked in permissions.ts — the expected
// answer moves with the app.
const permissionCache = new Map<RoleKey, string[]>()

export async function getRolePermissions(request: APIRequestContext, role: RoleKey): Promise<string[]> {
  const cached = permissionCache.get(role)
  if (cached) return cached

  const data = await expectOk(
    await request.post(`${API}/auth/login`, { data: { email: ACCOUNTS[role], password: TEST_PASSWORD } }),
  )
  const permissions = (data.user?.role?.permissions ?? []) as string[]
  permissionCache.set(role, permissions)
  return permissions
}

// Looks a doctor's User id up by email. Both Nurse and Doctor hold
// 'user.readDoctors' (it's what powers the app's own doctor pickers), so
// either can make this call.
export async function findDoctorId(request: APIRequestContext, doctorEmail: string, asRole: RoleKey = 'nurse') {
  const headers = await authHeaders(request, asRole)
  const doctors = (await expectOk(await request.get(`${API}/users/doctors`, { headers }))) as Array<{
    id: string
    email: string
  }>
  const doctor = doctors.find((d) => d.email === doctorEmail)
  if (!doctor) throw new Error(`Seeded doctor not found: ${doctorEmail}`)
  return doctor.id
}

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

// Registering a patient is a Nurse action ('patient.create').
export async function registerPatient(request: APIRequestContext, tag = uniqueTag()) {
  const headers = await authHeaders(request, 'nurse')
  const patient = (await expectOk(
    await request.post(`${API}/patients`, {
      headers,
      data: {
        firstName: 'E2E',
        // The tag lives in the surname so it shows up in every list, search
        // result and page heading the specs assert against.
        lastName: `Patient ${tag}`,
        dob: '1990-01-01',
        gender: 'OTHER',
        phone: '0200000000',
      },
    }),
  )) as { _id: string; patientNumber: string }
  return { ...patient, tag }
}

const toHHMM = (minuteOfDay: number) =>
  `${String(Math.floor(minuteOfDay / 60)).padStart(2, '0')}:${String(minuteOfDay % 60).padStart(2, '0')}`

function randomSlot() {
  const startMinuteOfDay = 6 * 60 + Math.floor(Math.random() * 780) // 06:00-19:00
  return { startTime: toHHMM(startMinuteOfDay), endTime: toHHMM(startMinuteOfDay + 30) }
}

// A random date inside the next 90 days. Spreading across days matters more
// than it first looks: appointment.service.ts rejects *overlapping* slots, not
// just identical ones, so a single day only holds ~26 non-conflicting 30-minute
// slots per doctor. With every spec booking the same seeded doctor, packing
// them all into today made collisions near-certain rather than rare.
function randomFutureDate() {
  const daysAhead = 1 + Math.floor(Math.random() * 90)
  const date = new Date()
  date.setDate(date.getDate() + daysAhead)
  return date.toISOString().slice(0, 10)
}

// Booking is a Nurse action. `date` is worth passing explicitly for anything
// that then looks at the appointments list in the UI, which shows one day at
// a time — otherwise the booking lands on some random future day and isn't on
// screen.
export async function bookAppointment(
  request: APIRequestContext,
  opts: {
    patientId: string
    doctorEmail: string
    reason?: string
    date?: string
    // Pass both to pin an exact slot — needed by the double-booking spec,
    // which has to guarantee a collision rather than hope for one.
    startTime?: string
    endTime?: string
  },
) {
  const headers = await authHeaders(request, 'nurse')
  const doctorId = await findDoctorId(request, opts.doctorEmail)

  // Even with the wide date range above, two parallel specs can still pick the
  // same doctor/day/slot. Rather than making that a flaky failure, take the
  // 409 as a cue to pick again — this is fixture setup, and the exact time
  // doesn't matter to any caller.
  // An explicitly pinned slot is never retried — the caller asked for that
  // exact time, so quietly moving it would defeat the point.
  const pinnedSlot = opts.startTime && opts.endTime ? { startTime: opts.startTime, endTime: opts.endTime } : null
  const attempts = pinnedSlot ? 1 : 8

  let lastError: unknown
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return (await expectOk(
        await request.post(`${API}/appointments`, {
          headers,
          data: {
            patient: opts.patientId,
            doctor: doctorId,
            date: opts.date ?? randomFutureDate(),
            ...(pinnedSlot ?? randomSlot()),
            reason: opts.reason,
          },
        }),
      )) as { _id: string }
    } catch (err) {
      if (!String(err).includes('APPOINTMENT_CONFLICT')) throw err
      lastError = err
    }
  }
  throw new Error(`Could not find a free appointment slot after 8 attempts: ${String(lastError)}`)
}

// Opening an encounter is a Nurse action, and the encounter takes on whichever
// doctor the appointment was booked with (see encounter.routes.ts).
export async function openEncounter(
  request: APIRequestContext,
  opts: { patientId: string; appointmentId: string; chiefComplaint?: string },
) {
  const headers = await authHeaders(request, 'nurse')
  return (await expectOk(
    await request.post(`${API}/encounters`, {
      headers,
      data: {
        patient: opts.patientId,
        appointment: opts.appointmentId,
        chiefComplaint: opts.chiefComplaint ?? 'E2E test complaint',
      },
    }),
  )) as { _id: string }
}

// The whole patient → appointment → encounter chain in one call, which is the
// minimum POST /encounters requires. Returns the patient too, since specs
// usually need to find it by tag afterwards.
export async function createOpenEncounterForDoctor(request: APIRequestContext, doctorEmail: string, tag = uniqueTag()) {
  const patient = await registerPatient(request, tag)
  const appointment = await bookAppointment(request, { patientId: patient._id, doctorEmail })
  const encounter = await openEncounter(request, { patientId: patient._id, appointmentId: appointment._id })
  return { ...encounter, patient, tag }
}

// Creates a throwaway account, as Admin. Needed by any spec that changes a
// session's own state — logging out bumps that user's tokenVersion, which
// invalidates every saved storageState for them, so a spec that logs out must
// never do it to one of the seven shared seeded logins.
export async function createThrowawayUser(
  request: APIRequestContext,
  opts: { role?: string; tag?: string } = {},
) {
  const headers = await authHeaders(request, 'admin')
  const tag = opts.tag ?? uniqueTag()
  const email = `e2e.${tag.toLowerCase()}@sana.test`
  const password = 'Password123!'

  await expectOk(
    await request.post(`${API}/users`, {
      headers,
      data: {
        email,
        password,
        firstName: 'E2E',
        lastName: `Throwaway ${tag}`,
        role: opts.role ?? 'NURSE',
      },
    }),
  )
  return { email, password, tag }
}

// The patient record linked to the PATIENT login (Kofi Asante — see
// server/src/test/e2eSeed.ts). Specs that need to check what a patient sees in
// their own portal have to use *this* patient, because the portal resolves its
// data through Patient.user, not through the User record.
//
// It's the one seeded patient specs are allowed to add records to. That stays
// safe because everything added is additive and tag-scoped — the rule it must
// not break is "don't assert you're the only row", not "never touch it".
export async function findPortalPatientId(request: APIRequestContext) {
  const headers = await authHeaders(request, 'nurse')
  const data = (await expectOk(await request.get(`${API}/patients?search=Asante`, { headers }))) as {
    patients: Array<{ _id: string; firstName: string; lastName: string }>
  }
  const portalPatient = data.patients.find((p) => p.lastName === 'Asante')
  if (!portalPatient) throw new Error('Seeded portal patient (Kofi Asante) not found — is seedE2EPatients running?')
  return portalPatient._id
}

// Opens an encounter for a patient that already exists, rather than
// registering a fresh one (which is what createOpenEncounterForDoctor does).
export async function createEncounterForPatient(
  request: APIRequestContext,
  opts: { patientId: string; doctorEmail: string },
) {
  const appointment = await bookAppointment(request, { patientId: opts.patientId, doctorEmail: opts.doctorEmail })
  return openEncounter(request, { patientId: opts.patientId, appointmentId: appointment._id })
}

// Vitals are a Nurse action ('vitals.create').
export async function recordVitals(
  request: APIRequestContext,
  encounterId: string,
  vitals: Record<string, number> = { temperature: 36.8, heartRate: 78, systolicBp: 120, diastolicBp: 80 },
) {
  const headers = await authHeaders(request, 'nurse')
  return (await expectOk(
    await request.post(`${API}/encounters/${encounterId}/vitals`, { headers, data: vitals }),
  )) as { _id: string }
}

// Diagnoses/prescriptions/lab orders are all restricted to the encounter's own
// assigned doctor, so these take the doctor whose encounter it is.
export async function addDiagnosis(
  request: APIRequestContext,
  encounterId: string,
  opts: { doctorRole?: RoleKey; diagnosis?: string; tag?: string } = {},
) {
  const headers = await authHeaders(request, opts.doctorRole ?? 'doctorA')
  return (await expectOk(
    await request.post(`${API}/encounters/${encounterId}/diagnoses`, {
      headers,
      data: { diagnosis: opts.diagnosis ?? `E2E diagnosis ${opts.tag ?? uniqueTag()}` },
    }),
  )) as { _id: string }
}

export async function writePrescription(
  request: APIRequestContext,
  encounterId: string,
  opts: { doctorRole?: RoleKey; drugName?: string; tag?: string } = {},
) {
  const headers = await authHeaders(request, opts.doctorRole ?? 'doctorA')
  return (await expectOk(
    await request.post(`${API}/encounters/${encounterId}/prescriptions`, {
      headers,
      data: {
        medications: [
          {
            drugName: opts.drugName ?? `E2E-Drug-${opts.tag ?? uniqueTag()}`,
            dosage: '500mg',
            frequency: '3x daily',
            duration: '5 days',
          },
        ],
      },
    }),
  )) as { _id: string; prescriptionNumber: string }
}

// Dispensing is the Pharmacist's action, and flips PRESCRIBED -> DISPENSED
// atomically (a second call 409s), notifying the prescribing doctor.
export async function dispensePrescription(request: APIRequestContext, prescriptionId: string) {
  const headers = await authHeaders(request, 'pharmacist')
  return (await expectOk(
    await request.patch(`${API}/prescriptions/${prescriptionId}/dispense`, { headers }),
  )) as { _id: string; status: string }
}

// Lab orders are posted to /lab-orders with the encounter in the body (unlike
// prescriptions/referrals, which hang off /encounters/:id).
export async function orderLabTest(
  request: APIRequestContext,
  encounterId: string,
  opts: { doctorRole?: RoleKey; testName?: string; tag?: string } = {},
) {
  const headers = await authHeaders(request, opts.doctorRole ?? 'doctorA')
  const testName = opts.testName ?? `E2E Test ${opts.tag ?? uniqueTag()}`
  const order = (await expectOk(
    await request.post(`${API}/lab-orders`, {
      headers,
      data: { encounter: encounterId, tests: [{ testName }] },
    }),
  )) as { _id: string; orderNumber?: string }
  return { ...order, testName }
}

// Entering and releasing results are both Lab Tech actions — Admin has
// read-only oversight here and deliberately can't do either.
export async function enterLabResult(
  request: APIRequestContext,
  opts: { labOrderId: string; testName: string; resultValue?: string },
) {
  const headers = await authHeaders(request, 'labtech')
  return (await expectOk(
    await request.post(`${API}/lab-results`, {
      headers,
      data: {
        labOrder: opts.labOrderId,
        testName: opts.testName,
        resultValue: opts.resultValue ?? '12.5',
        unit: 'g/dL',
        referenceRange: '13.0-17.0',
        interpretation: 'NORMAL',
      },
    }),
  )) as { _id: string }
}

export async function releaseLabResult(request: APIRequestContext, labResultId: string) {
  const headers = await authHeaders(request, 'labtech')
  return (await expectOk(
    await request.patch(`${API}/lab-results/${labResultId}/release`, { headers }),
  )) as { _id: string; status: string }
}

// An invoice always bills exactly one thing — createInvoiceSchema requires
// exactly one of `labOrder`/`prescription`, so callers must pass one.
export async function createInvoice(
  request: APIRequestContext,
  opts: {
    prescriptionId?: string
    labOrderId?: string
    description?: string
    qty?: number
    unitPrice?: number
    tag?: string
  },
) {
  const headers = await authHeaders(request, 'admin')
  const tag = opts.tag ?? uniqueTag()
  return (await expectOk(
    await request.post(`${API}/invoices`, {
      headers,
      data: {
        ...(opts.prescriptionId ? { prescription: opts.prescriptionId } : {}),
        ...(opts.labOrderId ? { labOrder: opts.labOrderId } : {}),
        items: [
          {
            description: opts.description ?? `E2E charge ${tag}`,
            qty: opts.qty ?? 1,
            unitPrice: opts.unitPrice ?? 100,
          },
        ],
      },
    }),
  )) as { _id: string; invoiceNumber: string; total: number; balance: number; status: string }
}

export async function recordPayment(
  request: APIRequestContext,
  opts: { invoiceId: string; amount: number; method?: 'CASH' | 'CARD' | 'MOBILE_MONEY' | 'INSURANCE' },
) {
  const headers = await authHeaders(request, 'admin')
  return (await expectOk(
    await request.post(`${API}/payments`, {
      headers,
      data: { invoice: opts.invoiceId, amount: opts.amount, method: opts.method ?? 'CASH' },
    }),
  )) as { _id: string }
}

// Opens an encounter for fromDoctor, then refers it to toDoctor — the whole
// chain via direct API calls, for specs that just need a referral (and its
// notify()) to exist rather than testing the referral flow itself.
export async function sendReferral(
  request: APIRequestContext,
  fromDoctorEmail: string,
  toDoctorEmail: string,
  tag = uniqueTag(),
) {
  const encounter = await createOpenEncounterForDoctor(request, fromDoctorEmail, tag)

  const fromRole = (Object.keys(ACCOUNTS) as RoleKey[]).find((r) => ACCOUNTS[r] === fromDoctorEmail) ?? 'doctorA'
  const headers = await authHeaders(request, fromRole)
  const toDoctorId = await findDoctorId(request, toDoctorEmail, fromRole)

  const referral = (await expectOk(
    await request.post(`${API}/encounters/${encounter._id}/referrals`, {
      headers,
      data: { toDoctor: toDoctorId, reason: `E2E referral ${tag}` },
    }),
  )) as { _id: string }
  return { ...referral, tag, encounter }
}
