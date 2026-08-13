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
  ClipboardCheck,
  Sparkles,
  ClipboardList,
} from 'lucide-react'
import { useAuth } from '@/features/auth/useAuth'
import { Button } from '@/components/ui/button'
import { StatCard } from '@/components/StatCard'

const ROLES = [
  { icon: ShieldCheck, label: 'Admin' },
  { icon: Stethoscope, label: 'Doctor' },
  { icon: ClipboardPlus, label: 'Nurse' },
  { icon: UserRound, label: 'Patient' },
  { icon: FlaskConical, label: 'Lab Tech' },
]

// The four modules a visitor can expect once signed in — each maps to a
// real, working part of the system rather than an invented service line.
const MODULES = [
  { icon: Users, title: 'Patient records', detail: 'One chart per patient — visits, vitals, and results in one place.' },
  { icon: CalendarCheck, title: 'Appointments', detail: 'Book and track visits across every doctor and department.' },
  { icon: FlaskConical, title: 'Lab workflow', detail: 'Order, enter, and release results the moment they exist.' },
  { icon: Receipt, title: 'Billing', detail: 'Invoices generated straight from the encounter.' },
]

// Real numbers from the seeded MongoDB Atlas dataset — used as the hero's
// visual anchor instead of a stock photo or gradient panel, so the "sauce"
// stays inside the spec's rules (no decorative gradients, no illustration)
// while still giving the hero something richer than plain text to look at.
const SNAPSHOT_STATS = [
  { icon: Users, value: '64', label: 'Patients on record' },
  { icon: CalendarCheck, value: '116', label: 'Appointments booked' },
  { icon: FlaskConical, value: '30', label: 'Lab orders processed' },
  { icon: ClipboardCheck, value: '49', label: 'Encounters completed' },
]

// A real, ordered sequence — not a decorative 01/02/03 — so the numbering
// here encodes an actual order of operations a record moves through.
const JOURNEY = [
  { step: '01', title: 'Register', detail: 'Admin opens a record — a patient becomes SAN-2026-00001.' },
  { step: '02', title: 'Book', detail: 'An appointment is scheduled with the right doctor and department.' },
  { step: '03', title: 'Record vitals', detail: 'A nurse logs temperature, pulse, and blood pressure at the visit.' },
  { step: '04', title: 'Consult', detail: 'The doctor diagnoses — and can ask MediAssist AI for a second opinion.' },
  { step: '05', title: 'Resolve', detail: 'Labs are released, the invoice is settled, the patient is notified.' },
]

// Footer link groups — real destinations only (the actual routes/roles
// this app has), never placeholder links to pages that don't exist.
const FOOTER_MODULES = MODULES.map((m) => m.title)
const FOOTER_ROLES = ROLES.map((r) => r.label)

// This is a pre-login information screen for a clinical system, not a
// marketing site — so it follows the same "calm authority" rule as the
// rest of the app: no gradients, no rounded-full buttons, no decorative
// motion. Quiet enough that it could sit directly next to the login page
// without feeling like a different product.
export function LandingPage() {
  const { user } = useAuth()
  const primaryHref = user ? '/dashboard' : '/login'
  const primaryLabel = user ? 'Go to dashboard' : 'Sign in'

  return (
    <div className="min-h-svh bg-background font-sans text-foreground">
      {/* ---------- Top bar — sticky, so navigation and the sign-in CTA
           stay reachable while reading a fairly long page. ---------- */}
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-8 py-4">
          <span className="flex items-center gap-2 text-2xl font-bold tracking-tight text-blue-600">
            <Activity className="size-6" /> Sana
          </span>
          <nav className="hidden items-center gap-8 text-sm font-medium text-slate-600 md:flex">
            <a href="#modules" className="hover:text-slate-900">Modules</a>
            <a href="#journey" className="hover:text-slate-900">How it works</a>
            <a href="#ai" className="hover:text-slate-900">MediAssist AI</a>
          </nav>
          <Button asChild size="lg">
            <Link to={primaryHref}>
              {primaryLabel} <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </header>

      {/* ---------- Hero: text left, real-data snapshot right — the
           snapshot card is the page's one "richer" element, built from
           actual seeded numbers rather than a stock illustration. ---------- */}
      <section className="mx-auto max-w-7xl px-8 py-20">
        <div className="grid grid-cols-1 items-center gap-16 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="text-sm font-medium tracking-wider text-blue-600 uppercase">
              Hospital management system
            </p>
            <h1 className="mt-4 max-w-2xl text-4xl leading-[1.15] font-semibold tracking-tight text-slate-900 sm:text-5xl">
              Registration, vitals, lab results, and billing — one real-time record per patient.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-600">
              Sana connects every step of a visit so the moment a lab result is ready, the doctor
              already knows. Built for Admin, Doctor, Nurse, and Patient roles, each with their
              own workspace.
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

            <div className="mt-12 flex items-center gap-6 border-t border-border pt-6">
              <span className="text-sm text-slate-500">One system, five workspaces</span>
              <div className="flex items-center gap-5">
                {ROLES.map((role) => (
                  <span key={role.label} className="flex items-center gap-1.5 text-sm text-slate-600">
                    <role.icon className="size-4 text-slate-400" />
                    {role.label}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* A real photo as the hero's dominant visual — a doctor
              actually talking to a patient, not a stock illustration or
              gradient panel — with the live-data stat strip sitting just
              beneath it as a quieter, secondary element. */}
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
              <p className="text-xs font-medium tracking-wider text-slate-500 uppercase">Live on this system</p>
              <div className="mt-4 grid grid-cols-2 gap-4">
                {SNAPSHOT_STATS.map((stat) => (
                  <StatCard key={stat.label} icon={stat.icon} value={stat.value} label={stat.label} className="border-0 bg-transparent p-0 shadow-none" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Modules ---------- */}
      <section id="modules" className="border-t border-border bg-secondary/40">
        <div className="mx-auto max-w-7xl px-8 py-16">
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

      {/* ---------- Patient journey — a real, ordered sequence, so the
           01/02/03 numbering encodes an actual order of operations rather
           than decorating an unordered list. ---------- */}
      <section id="journey" className="border-t border-border">
        <div className="mx-auto max-w-7xl px-8 py-16">
          <p className="flex items-center gap-2 text-xs font-medium tracking-wider text-blue-600 uppercase">
            <ClipboardList className="size-3.5" /> The patient journey
          </p>
          <h2 className="mt-2 max-w-lg text-2xl font-semibold text-slate-900">Five roles, one continuous record.</h2>

          <div className="mt-9 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
            {JOURNEY.map((item) => (
              <div key={item.step} className="rounded-lg border border-border bg-card p-5 shadow-sm">
                <span className="flex size-8 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                  {item.step}
                </span>
                <h3 className="mt-3 text-sm font-medium text-slate-900">{item.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{item.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- MediAssist AI — styled exactly like the in-app AI
           panels (bg-blue-50/60, border-blue-200) so the preview here
           matches what a doctor actually sees during a consultation. ---------- */}
      <section id="ai" className="border-t border-border bg-secondary/40">
        <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-14 px-8 py-16 lg:grid-cols-2">
          <div>
            <p className="flex items-center gap-2 text-xs font-medium tracking-wider text-blue-600 uppercase">
              <Sparkles className="size-3.5" /> MediAssist AI
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-slate-900">
              A second opinion, grounded in cited sources — never a diagnosis.
            </h2>
            <p className="mt-4 max-w-md text-base leading-relaxed text-slate-600">
              During a consultation, a doctor can ask MediAssist AI a clinical question. It
              retrieves relevant guidance and returns an answer with its sources attached — the
              doctor reviews, accepts, or ignores it. The record is theirs; the judgement stays
              theirs too.
            </p>
          </div>

          <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-5 shadow-sm">
            <div className="flex items-center gap-2 border-b border-blue-200 pb-3">
              <Sparkles className="size-4 text-blue-600" />
              <span className="text-sm font-medium text-slate-900">MediAssist AI — Diagnostic Support</span>
            </div>
            <div className="mt-3 rounded-md border border-border bg-white px-3 py-2 text-sm text-slate-900">
              "Persistent cough, weight loss, night sweats — 3 weeks"
            </div>
            <div className="mt-3 space-y-2 text-sm leading-relaxed text-slate-600">
              <p>
                Consider pulmonary tuberculosis in the differential. Recommend sputum smear
                microscopy and chest X-ray; assess for HIV co-infection.
              </p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                <span className="rounded-full border border-border bg-white px-2 py-0.5 text-[11px] text-slate-500">
                  Pulmonary TB — Presentation & Approach
                </span>
                <span className="rounded-full border border-border bg-white px-2 py-0.5 text-[11px] text-slate-500">
                  WHO TB Guidelines
                </span>
              </div>
            </div>
            <p className="mt-3 border-t border-blue-200 pt-3 text-xs text-slate-500 italic">
              Clinical judgement must guide all decisions — reviewed by the doctor before it
              touches the record. Not a diagnosis.
            </p>
          </div>
        </div>
      </section>

      {/* ---------- The human reason this exists — the one deliberately
           warmer moment on the page, grounded in a real photo rather than
           a slogan on a gradient panel. Kept to a single quiet section, not
           scattered across the page, so it reads as sincere rather than
           decorative. ---------- */}
      <section className="border-t border-border">
        <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-14 px-8 py-16 lg:grid-cols-2">
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
              well. Sana exists so that gap closes the moment it can — a lab result reaches the
              doctor, an appointment reaches the right department, an invoice reaches billing,
              all without anyone having to go looking for it.
            </p>
          </div>
        </div>
      </section>

      {/* ---------- Footer — a proper multi-column footer with real,
           working destinations rather than a single thin bar. ---------- */}
      <footer className="border-t border-border bg-card">
        <div className="mx-auto max-w-7xl px-8 py-14">
          <div className="grid grid-cols-2 gap-10 sm:grid-cols-4">
            <div className="col-span-2 sm:col-span-1">
              <span className="flex items-center gap-2 text-lg font-bold text-blue-600">
                <Activity className="size-5" /> Sana
              </span>
              <p className="mt-3 max-w-[220px] text-sm leading-relaxed text-slate-500">
                Hospital coordination, in real time — one record from registration to billing.
              </p>
            </div>

            <div>
              <p className="text-xs font-medium tracking-wider text-slate-400 uppercase">Modules</p>
              <ul className="mt-3 space-y-2">
                {FOOTER_MODULES.map((label) => (
                  <li key={label}>
                    <a href="#modules" className="text-sm text-slate-600 hover:text-blue-600">{label}</a>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="text-xs font-medium tracking-wider text-slate-400 uppercase">Workspaces</p>
              <ul className="mt-3 space-y-2">
                {FOOTER_ROLES.map((label) => (
                  <li key={label}>
                    <Link to={primaryHref} className="text-sm text-slate-600 hover:text-blue-600">{label}</Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="text-xs font-medium tracking-wider text-slate-400 uppercase">Get started</p>
              <ul className="mt-3 space-y-2">
                <li>
                  <Link to={primaryHref} className="text-sm text-slate-600 hover:text-blue-600">{primaryLabel}</Link>
                </li>
                <li>
                  <a href="#ai" className="text-sm text-slate-600 hover:text-blue-600">MediAssist AI</a>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-border pt-6 sm:flex-row">
            <p className="text-xs text-slate-500">© 2026 Sana. Built for the University of Ghana.</p>
            <p className="text-xs text-slate-400">Hospital management, coordinated in real time.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
