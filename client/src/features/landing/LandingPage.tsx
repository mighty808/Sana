import { Link } from 'react-router-dom'
import {
  ShieldCheck,
  Stethoscope,
  ClipboardPlus,
  UserRound,
  ArrowRight,
  Users,
  CalendarCheck,
  FlaskConical,
  Receipt,
  Activity,
  Sparkles,
  ClipboardList,
  Pill,
  Send,
  BedDouble,
  Bell,
  HeartPulse,
  FileText,
} from 'lucide-react'
import { useAuth } from '@/features/auth/useAuth'
import { Button } from '@/components/ui/button'
import { StatCard } from '@/components/StatCard'

// The six workspaces. Each one is a real role with its own sign-in and its own
// screens. Keep this in step with ROLE_NAMES on the server.
const ROLES = [
  { icon: ShieldCheck, label: 'Admin' },
  { icon: Stethoscope, label: 'Doctor' },
  { icon: ClipboardPlus, label: 'Nurse' },
  { icon: UserRound, label: 'Patient' },
  { icon: FlaskConical, label: 'Lab Tech' },
  { icon: Pill, label: 'Pharmacist' },
]

// What a visitor can expect once signed in. Every card maps to a part of the
// system that works today, not a planned feature.
const MODULES = [
  { icon: Users, title: 'Patient records', detail: 'One chart per patient: visits, vitals and results in one place.' },
  { icon: CalendarCheck, title: 'Appointments', detail: 'Book and track visits across every doctor.' },
  { icon: FlaskConical, title: 'Lab workflow', detail: 'Order, enter and release results. The doctor is told the moment one is ready.' },
  { icon: Pill, title: 'Prescriptions', detail: 'Doctors prescribe on the visit. The pharmacist bills and dispenses from a queue.' },
  { icon: Send, title: 'Referrals', detail: 'Refer a patient to another doctor and talk the case through in a message thread.' },
  { icon: BedDouble, title: 'Ward board', detail: 'Every open encounter and its acuity, on one screen.' },
  { icon: Receipt, title: 'Billing', detail: 'Invoices for lab orders and prescriptions, with part payments tracked.' },
  { icon: Bell, title: 'Notifications', detail: 'Real-time alerts to the right person when something needs them.' },
]

// Facts about the product itself. These used to be "live" counts typed in by
// hand (64 patients, 116 appointments and so on), which stopped being true the
// moment the database changed. Nothing here depends on the data, so it cannot
// go stale that way. If the knowledge base grows, update the passage count to
// match ai-service/rag/knowledge_base.py.
const PRODUCT_FACTS = [
  { icon: UserRound, value: '6', label: 'Role workspaces' },
  { icon: FileText, value: '42', label: 'Ghana STG passages' },
  { icon: Sparkles, value: '3', label: 'Sana AI assists' },
  { icon: ClipboardList, value: '1', label: 'Record per patient' },
]

// A real, ordered sequence, so the numbering means something. It follows the
// order a visit actually moves through the system.
const JOURNEY = [
  { step: '01', icon: Users, title: 'Register and book', detail: 'Admin opens a record and books the visit with the right doctor.' },
  { step: '02', icon: Activity, title: 'Record vitals', detail: 'A nurse logs temperature, pulse and blood pressure, and gets an acuity read.' },
  { step: '03', icon: Stethoscope, title: 'Consult', detail: 'The doctor diagnoses, and can ask Sana AI for differentials.' },
  { step: '04', icon: FlaskConical, title: 'Test', detail: 'Labs are ordered, entered and released to the doctor.' },
  { step: '05', icon: Pill, title: 'Treat', detail: 'A prescription is written, billed and dispensed by the pharmacist.' },
  { step: '06', icon: Receipt, title: 'Settle', detail: 'The invoice is paid and the patient can see their own record.' },
]

// What Sana AI does today, one line each.
const AI_FEATURES = [
  { icon: Stethoscope, title: 'Differential decision tool', detail: 'Ranked possible diagnoses with a confidence level, based on the complaint, vitals, lab results and any diagnoses already recorded.' },
  { icon: HeartPulse, title: 'Acuity for nurses', detail: 'After vitals, a Stable, Urgent or Critical read. A Critical one alerts the doctor.' },
  { icon: FlaskConical, title: 'Lab result notes', detail: 'A plain-language explanation of an entered result, flagged for the doctor.' },
]

// Footer link groups. They only point at real destinations: the sections on
// this page and the sign-in route.
const FOOTER_MODULES = MODULES.slice(0, 6).map((m) => m.title)
const FOOTER_ROLES = ROLES.map((r) => r.label)

// This is a pre-login information screen for a clinical system, not a
// marketing site. It follows the same calm, professional look as the rest of
// the app: no gradients, no fully rounded buttons, no decorative animation. It
// should look quiet enough to sit next to the login page without feeling like
// a different product.
export function LandingPage() {
  const { user } = useAuth()
  const primaryHref = user ? '/dashboard' : '/login'
  const primaryLabel = user ? 'Go to dashboard' : 'Sign in'

  return (
    <div className="min-h-svh bg-background font-sans text-foreground">
      {/* ---------- Top bar. Fixed to the top while scrolling, so navigation and
           the sign-in button stay reachable on this fairly long page. ---------- */}
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-8">
          <img src="/logo-full.png" alt="Sana" className="h-8 w-auto" />
          <nav className="hidden items-center gap-8 text-sm font-medium text-slate-600 md:flex">
            <a href="#modules" className="hover:text-slate-900">Modules</a>
            <a href="#journey" className="hover:text-slate-900">How it works</a>
            <a href="#ai" className="hover:text-slate-900">Sana AI</a>
          </nav>
          <Button asChild size="lg">
            <Link to={primaryHref}>
              {primaryLabel} <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </header>

      {/* ---------- Hero: text on the left, a real photo with a few product
           facts beneath it on the right. ---------- */}
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-8 sm:py-20">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
          <div>
            <p className="text-sm font-medium tracking-wider text-blue-600 uppercase">
              Hospital management system
            </p>
            <h1 className="mt-4 max-w-2xl text-4xl leading-[1.1] font-bold tracking-tight text-slate-900 sm:text-5xl">
              One real-time record per patient,{' '}
              <span className="text-blue-600">from registration to billing.</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-600">
              Sana connects every step of a visit, so the moment a lab result is ready the doctor
              already knows. Built for six roles, each with their own workspace, and with an AI
              assistant that supports the doctor and never decides for them.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <Link to={primaryHref}>
                  {primaryLabel} <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <a href="#modules">See what's included</a>
              </Button>
            </div>

            <div className="mt-12 border-t border-border pt-6">
              <p className="text-sm text-slate-600">One system, six workspaces</p>
              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
                {ROLES.map((role) => (
                  <span key={role.label} className="flex items-center gap-1.5 text-sm text-slate-600">
                    <role.icon className="size-4 text-slate-600" />
                    {role.label}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div>
            <div className="overflow-hidden rounded-lg border border-border shadow-sm">
              <img
                src="https://images.unsplash.com/photo-1536064479547-7ee40b74b807?fm=jpg&q=80&w=1200&auto=format&fit=crop"
                alt="A doctor talking with a young patient during a consultation"
                className="aspect-[4/3] w-full object-cover"
                loading="lazy"
              />
            </div>
            <div className="mt-4 rounded-lg border border-border bg-card p-5 shadow-sm">
              <p className="text-xs font-medium tracking-wider text-slate-600 uppercase">Built into the system</p>
              <div className="mt-4 grid grid-cols-2 gap-4">
                {PRODUCT_FACTS.map((fact) => (
                  <StatCard key={fact.label} icon={fact.icon} value={fact.value} label={fact.label} className="border-0 bg-transparent p-0 shadow-none" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Modules ---------- */}
      <section id="modules" className="scroll-mt-20 border-t border-border bg-secondary/40">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-8 sm:py-16">
          <p className="text-xs font-medium tracking-wider text-blue-600 uppercase">What's included</p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-900">Everything a visit touches, in one place.</h2>
          <div className="mt-7 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {MODULES.map((mod) => (
              <div key={mod.title} className="rounded-lg border border-border bg-card p-6 shadow-sm">
                <span className="flex size-11 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                  <mod.icon className="size-5" />
                </span>
                <h3 className="mt-4 text-base font-medium text-slate-900">{mod.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{mod.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Visit journey. A real, ordered sequence, so the 01, 02, 03
           numbering reflects an actual order of steps. ---------- */}
      <section id="journey" className="scroll-mt-20 border-t border-border">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-8 sm:py-16">
          <p className="flex items-center gap-2 text-xs font-medium tracking-wider text-blue-600 uppercase">
            <ClipboardList className="size-3.5" /> How a visit runs
          </p>
          <h2 className="mt-2 max-w-lg text-2xl font-semibold text-slate-900">Six roles, one continuous record.</h2>

          <div className="mt-9 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {JOURNEY.map((item) => (
              <div key={item.step} className="rounded-lg border border-border bg-card p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="flex size-8 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                    {item.step}
                  </span>
                  <item.icon className="size-5 text-blue-600" />
                </div>
                <h3 className="mt-3 text-sm font-medium text-slate-900">{item.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{item.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Sana AI. The mock on the right is styled like the real
           differential panel inside the app, so a visitor sees what a doctor
           actually gets. The sources named in it are real titles from the
           knowledge base. ---------- */}
      <section id="ai" className="scroll-mt-20 border-t border-border bg-secondary/40">
        <div className="mx-auto grid max-w-7xl grid-cols-1 items-start gap-12 px-4 py-14 sm:px-8 sm:py-16 lg:grid-cols-2 lg:gap-14">
          <div>
            <p className="flex items-center gap-2 text-xs font-medium tracking-wider text-blue-600 uppercase">
              <Sparkles className="size-3.5" /> Sana AI
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-slate-900">
              A second opinion with its sources attached. Never a diagnosis.
            </h2>
            <p className="mt-4 max-w-md text-base leading-relaxed text-slate-600">
              Sana AI reads from Ghana Standard Treatment Guidelines and shows which passages an
              answer is based on. The doctor reviews it, accepts it or ignores it. It never writes
              to the patient record on its own, so the judgement stays theirs.
            </p>

            <ul className="mt-7 space-y-5">
              {AI_FEATURES.map((feature) => (
                <li key={feature.title} className="flex gap-3">
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                    <feature.icon className="size-4" />
                  </span>
                  <div>
                    <h3 className="text-sm font-medium text-slate-900">{feature.title}</h3>
                    <p className="mt-0.5 text-sm leading-relaxed text-slate-600">{feature.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-5 shadow-sm">
            <div className="flex items-center gap-2 border-b border-blue-200 pb-3">
              <Sparkles className="size-4 text-blue-600" />
              <span className="text-sm font-medium text-slate-900">Sana Differential Decision Tool</span>
            </div>
            <div className="mt-3 rounded-md border border-border bg-white px-3 py-2 text-sm text-slate-900">
              Fever, headache and chills for 3 days. Temp 39, HR 112. Malaria RDT positive.
            </div>

            <ol className="mt-3 space-y-2">
              <li className="rounded-md border border-border bg-white p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-slate-900">Malaria</span>
                  <span className="rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[11px] text-green-700">High</span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  Fever and chills for 3 days with a positive Malaria RDT.
                </p>
              </li>
              <li className="rounded-md border border-border bg-white p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-slate-900">Typhoid fever</span>
                  <span className="rounded-full border border-border bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600">Low</span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  Fever and headache fit, but the Widal test was negative.
                </p>
              </li>
              <li className="rounded-md border border-border bg-white p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-slate-900">Acute bacterial meningitis</span>
                  <span className="rounded-full border border-border bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600">Low</span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  Rule out if neck stiffness or altered consciousness develops.
                </p>
              </li>
            </ol>

            <div className="mt-3 flex flex-wrap gap-1.5">
              <span className="rounded-full border border-border bg-white px-2 py-0.5 text-[11px] text-slate-600">Ghana STG: Malaria</span>
              <span className="rounded-full border border-border bg-white px-2 py-0.5 text-[11px] text-slate-600">Ghana STG: Typhoid Fever</span>
              <span className="rounded-full border border-border bg-white px-2 py-0.5 text-[11px] text-slate-600">Ghana STG: Acute Bacterial Meningitis</span>
            </div>
            <p className="mt-3 border-t border-blue-200 pt-3 text-xs text-slate-600 italic">
              Clinical judgement must guide all decisions. Reviewed by the doctor before it touches
              the record. Not a diagnosis.
            </p>
          </div>
        </div>
      </section>

      {/* ---------- The human reason this app exists. The one intentionally
           warmer section, built around a real photo instead of a slogan on a
           gradient panel. Kept to this single quiet section so it reads as
           sincere rather than decorative. ---------- */}
      <section className="border-t border-border">
        <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-4 py-14 sm:px-8 sm:py-16 lg:grid-cols-2 lg:gap-14">
          <div className="overflow-hidden rounded-lg border border-border shadow-sm lg:order-2">
            <img
              src="https://images.unsplash.com/photo-1584516150909-c43483ee7932?fm=jpg&q=80&w=1200&auto=format&fit=crop"
              alt="A doctor and patient in a consultation room"
              className="aspect-[4/3] w-full object-cover"
              loading="lazy"
            />
          </div>
          <div className="lg:order-1">
            <p className="text-xs font-medium tracking-wider text-blue-600 uppercase">Why it matters</p>
            <h2 className="mt-3 text-2xl font-semibold text-slate-900">
              Behind every record is someone waiting to hear back.
            </h2>
            <p className="mt-4 max-w-md text-base leading-relaxed text-slate-600">
              A result that sits unopened in an inbox is a person who doesn't know if they're
              well. Sana exists so that gap closes the moment it can. A lab result reaches the
              doctor, a critical reading alerts the doctor straight away, a prescription reaches the
              pharmacist, and an invoice reaches billing, all without anyone having to go looking
              for it.
            </p>
          </div>
        </div>
      </section>

      {/* ---------- Footer: a multi-column footer whose links all go somewhere
           real. ---------- */}
      <footer className="border-t border-border bg-card">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-8">
          <div className="grid grid-cols-2 gap-10 sm:grid-cols-4">
            <div className="col-span-2 sm:col-span-1">
              <img src="/logo-full.png" alt="Sana" className="h-6 w-auto" />
              <p className="mt-3 max-w-[220px] text-sm leading-relaxed text-slate-600">
                Hospital coordination in real time, with one record from registration to billing.
              </p>
            </div>

            <div>
              <p className="text-xs font-medium tracking-wider text-slate-600 uppercase">Modules</p>
              <ul className="mt-3 space-y-2">
                {FOOTER_MODULES.map((label) => (
                  <li key={label}>
                    <a href="#modules" className="text-sm text-slate-600 hover:text-blue-600">{label}</a>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="text-xs font-medium tracking-wider text-slate-600 uppercase">Workspaces</p>
              <ul className="mt-3 space-y-2">
                {FOOTER_ROLES.map((label) => (
                  <li key={label}>
                    <Link to={primaryHref} className="text-sm text-slate-600 hover:text-blue-600">{label}</Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="text-xs font-medium tracking-wider text-slate-600 uppercase">Get started</p>
              <ul className="mt-3 space-y-2">
                <li>
                  <Link to={primaryHref} className="text-sm text-slate-600 hover:text-blue-600">{primaryLabel}</Link>
                </li>
                <li>
                  <a href="#ai" className="text-sm text-slate-600 hover:text-blue-600">Sana AI</a>
                </li>
                <li>
                  <a href="#journey" className="text-sm text-slate-600 hover:text-blue-600">How it works</a>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-border pt-6 sm:flex-row">
            <p className="text-xs text-slate-600">© 2026 Sana. Built for the University of Ghana.</p>
            <p className="text-xs text-slate-600">Hospital management, coordinated in real time.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
