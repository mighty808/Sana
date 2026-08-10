// Static reference data + small random-generation helpers used only by
// utils/bulkSeed.ts to produce realistic-looking demo data (see blueprint
// section 13.2's seed data requirements). Kept in its own file so
// bulkSeed.ts itself reads as "what gets created," not "here are 200 lines
// of name arrays" — this file is pure data + helpers, no DB writes.

// A representative spread of common Ghanaian first names (traditional day
// names plus widely-used English first names) and surnames — enough
// variety that generated patients/staff don't look obviously repetitive in
// a demo, without needing an external fake-data library for what's really
// just "pick realistic names for ~150 records."
export const MALE_FIRST_NAMES = [
  'Kwame', 'Kofi', 'Kwesi', 'Kwabena', 'Yaw', 'Kwaku', 'Kojo', 'Ekow', 'Fiifi',
  'Kingsley', 'Emmanuel', 'Samuel', 'Daniel', 'Michael', 'Isaac', 'Prince',
  'Nana', 'Solomon', 'Eric', 'Frank',
]

export const FEMALE_FIRST_NAMES = [
  'Ama', 'Efua', 'Akosua', 'Abena', 'Yaa', 'Adjoa', 'Akua', 'Afia', 'Esi',
  'Grace', 'Comfort', 'Gifty', 'Mercy', 'Vida', 'Priscilla', 'Abigail',
  'Joyce', 'Linda', 'Patience', 'Rita',
]

export const LAST_NAMES = [
  'Mensah', 'Owusu', 'Boateng', 'Asante', 'Agyeman', 'Osei', 'Amoah',
  'Appiah', 'Darko', 'Sarpong', 'Adjei', 'Frimpong', 'Nkrumah', 'Aidoo',
  'Quaye', 'Tetteh', 'Danso', 'Yeboah', 'Antwi', 'Acheampong',
]

// Standard clinical departments for a general hospital — matches the kind
// of departments referenced throughout earlier phases' live testing
// (Cardiology, General Medicine, etc.), expanded to a fuller realistic set.
export const DEPARTMENTS = [
  { name: 'General Medicine', description: 'Primary adult care and internal medicine.' },
  { name: 'Paediatrics', description: 'Care for infants, children, and adolescents.' },
  { name: 'Obstetrics & Gynaecology', description: 'Maternal, pregnancy, and women\'s health.' },
  { name: 'Surgery', description: 'General and specialist surgical care.' },
  { name: 'Cardiology', description: 'Heart and cardiovascular conditions.' },
  { name: 'Emergency', description: 'Urgent and acute care.' },
  { name: 'Orthopaedics', description: 'Musculoskeletal injuries and conditions.' },
  { name: 'ENT', description: 'Ear, nose, and throat conditions.' },
]

// Chief complaints an encounter might open with — deliberately overlapping
// with the conditions covered in ai-service/rag/knowledge_base.py (Phase 8),
// so a demo doctor consulting MediAssist AI during one of these seeded
// encounters gets a realistically relevant response.
export const CHIEF_COMPLAINTS = [
  'Persistent cough, weight loss, and night sweats for 3 weeks',
  'Fever with chills and headache for 2 days',
  'Sustained fever with abdominal pain for 5 days',
  'Elevated blood pressure on routine check, no symptoms',
  'Increased thirst, frequent urination, and fatigue',
  'Fever, productive cough, and chest pain for 4 days',
  'Burning sensation on urination and lower abdominal discomfort',
  'Watery diarrhoea and vomiting since yesterday',
  'Wheeze and shortness of breath, worse at night',
  'Fatigue, pale appearance, and shortness of breath on exertion',
  'Right upper quadrant abdominal pain after meals',
  'Lower back pain radiating to the left leg for 1 week',
  'Sore throat and difficulty swallowing for 3 days',
  'Swollen and painful right knee after a fall',
  'Recurrent headaches with sensitivity to light',
]

// Lab tests that might get ordered against an encounter — overlaps with
// the conditions above so a seeded lab order plausibly relates to its
// encounter's chief complaint.
export const LAB_TEST_NAMES = [
  'Sputum smear', 'Chest X-ray', 'Malaria RDT', 'Blood culture',
  'Full blood count (FBC)', 'Urinalysis', 'Fasting blood glucose',
  'HbA1c', 'Lipid profile', 'Widal test', 'Stool microscopy',
  'Liver function test', 'Renal function test', 'ECG', 'Rapid strep test',
]

export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

export function randomFrom<T>(items: readonly T[]): T {
  return items[randomInt(0, items.length - 1)]!
}

// Ghana mobile numbers commonly start with one of these network prefixes.
const GHANA_PREFIXES = ['024', '020', '027', '026', '050', '055', '059']
export function randomGhanaPhone(): string {
  return `${randomFrom(GHANA_PREFIXES)}${String(randomInt(1000000, 9999999))}`
}

export function randomGender(): 'MALE' | 'FEMALE' {
  return Math.random() < 0.5 ? 'MALE' : 'FEMALE'
}

export function randomName(gender: 'MALE' | 'FEMALE') {
  const firstName = gender === 'MALE' ? randomFrom(MALE_FIRST_NAMES) : randomFrom(FEMALE_FIRST_NAMES)
  return { firstName, lastName: randomFrom(LAST_NAMES) }
}

// A random date of birth landing the patient somewhere between 1 and 90
// years old — wide enough to cover the paediatric-to-elderly spread a real
// hospital sees.
export function randomDob(): Date {
  const now = Date.now()
  const minAgeMs = 1 * 365 * 24 * 60 * 60 * 1000
  const maxAgeMs = 90 * 365 * 24 * 60 * 60 * 1000
  return new Date(now - randomInt(minAgeMs, maxAgeMs))
}

// A random date within `daysBack` days before today (inclusive of today).
export function randomPastDate(daysBack: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - randomInt(0, daysBack))
  d.setHours(0, 0, 0, 0)
  return d
}

// A random date between `daysBack` days ago and `daysForward` days ahead —
// used for appointments, which realistically span both history and the
// near future in a demo dataset.
export function randomDateAround(daysBack: number, daysForward: number): Date {
  const d = new Date()
  d.setDate(d.getDate() + randomInt(-daysBack, daysForward))
  d.setHours(0, 0, 0, 0)
  return d
}

// A random "HH:MM" 24-hour clinic time slot on the half-hour, between 08:00 and 16:30.
export function randomTimeSlot(): string {
  const hour = randomInt(8, 16)
  const minute = Math.random() < 0.5 ? '00' : '30'
  return `${String(hour).padStart(2, '0')}:${minute}`
}

export function addMinutes(time: string, minutes: number): string {
  const [h = 0, m = 0] = time.split(':').map(Number)
  const total = h * 60 + m + minutes
  const hh = Math.floor(total / 60) % 24
  const mm = total % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}
