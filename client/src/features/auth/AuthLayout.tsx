import { Activity, Users, CalendarCheck, FlaskConical, ClipboardCheck } from 'lucide-react'
import type { ReactNode } from 'react'

// The same live-data snapshot used on the landing page's hero — reused
// here so the auth screens feel like the same product, not a bare form
// bolted onto a different site.
const SNAPSHOT_STATS = [
  { icon: Users, value: '64', label: 'Patients on record' },
  { icon: CalendarCheck, value: '116', label: 'Appointments booked' },
  { icon: FlaskConical, value: '30', label: 'Lab orders processed' },
  { icon: ClipboardCheck, value: '49', label: 'Encounters completed' },
]

// The shared shell for every auth screen (Login, Forgot password, Reset
// password): a photo-led brand panel on the left — carrying the same
// clinical-photography language the landing page established — and the
// form itself on the right. On small screens the panel drops out entirely
// so the form is the whole screen, never squeezed beside a photo.
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-svh grid-cols-1 lg:grid-cols-2">
      {/* ---------- Brand panel — hidden below lg, since a split screen
           only works once there's room for both halves to breathe. ---------- */}
      <div className="relative hidden overflow-hidden lg:block">
        <img
          src="https://images.unsplash.com/photo-1536064479547-7ee40b74b807?fm=jpg&q=80&w=1400&auto=format&fit=crop"
          alt="A doctor talking with a young patient during a consultation"
          className="absolute inset-0 size-full object-cover"
        />
        {/* A bottom-up dark overlay exists purely so the white text over
            the photo stays legible — not a decorative gradient, a
            functional contrast fix confined to the photo itself. */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/85 via-slate-900/20 to-transparent" />

        <div className="relative flex h-full flex-col justify-between p-10">
          <span className="flex items-center gap-2 text-2xl font-bold tracking-tight text-white">
            <Activity className="size-6" /> Sana
          </span>

          <div>
            <h2 className="max-w-md text-2xl leading-snug font-semibold text-white">
              Registration, vitals, lab results, and billing — one real-time record per patient.
            </h2>
            <div className="mt-8 grid grid-cols-2 gap-4 rounded-lg border border-white/15 bg-white/10 p-5 backdrop-blur-sm">
              {SNAPSHOT_STATS.map((stat) => (
                <div key={stat.label} className="flex items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-white">
                    <stat.icon className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="tabular-nums text-lg font-bold text-white">{stat.value}</p>
                    <p className="text-xs text-white/70">{stat.label}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ---------- Form panel ---------- */}
      <div className="flex min-h-svh items-center justify-center bg-background p-4">{children}</div>
    </div>
  )
}
