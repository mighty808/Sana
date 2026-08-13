import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Phone, Mail, Droplet, ClipboardPlus, FlaskConical, Receipt } from 'lucide-react'
import { usePatientTimeline } from './api'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/EmptyState'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

// Turns a DOB string into a whole-years age — the header card shows age
// rather than a raw date of birth, matching how the patient header spec
// mockup lists "Age" as its own field.
function calculateAge(dob: string): number {
  const birth = new Date(dob)
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const hasHadBirthdayThisYear =
    now.getMonth() > birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() >= birth.getDate())
  if (!hasHadBirthdayThisYear) age -= 1
  return age
}

// A small placeholder for a non-empty timeline array we don't have a real
// row renderer for yet — distinct from EmptyState (which means "there is
// genuinely nothing here"), so a future reader never mistakes "no UI built
// yet" for "no data exists."
function ComingSoonList({ count, label }: { count: number; label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-slate-500">
      {count} {label} — the list view for these lands in a later build step.
    </div>
  )
}

export function PatientDetailPage() {
  const { id } = useParams<{ id: string }>()
  // The timeline endpoint already returns the patient alongside their
  // appointments/encounters/labOrders/invoices (all placeholder empty
  // arrays until Steps 4/5/7 add those collections) — fetching the patient
  // separately via GET /patients/:id as well would just be a second
  // network round-trip for data this call already has.
  const { data: timeline, isLoading } = usePatientTimeline(id)
  const patient = timeline?.patient

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    )
  }

  if (!patient) {
    return <EmptyState icon={ClipboardPlus} title="Patient not found" description="This record may have been removed." />
  }

  return (
    <div className="space-y-5">
      <Link to="/patients" className="flex w-fit items-center gap-1.5 text-sm text-slate-500 hover:text-blue-600">
        <ArrowLeft className="size-4" /> Back to Patients
      </Link>

      {/* ---------- Patient header card ---------- */}
      <Card>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold text-slate-900">
                {patient.firstName} {patient.lastName}
              </h2>
              <Badge variant="outline" className="border-blue-200 bg-blue-50 font-mono text-xs text-blue-700">
                {patient.patientNumber}
              </Badge>
              <Badge
                variant="outline"
                className={
                  patient.status === 'ACTIVE'
                    ? 'border-green-200 bg-green-50 text-green-700'
                    : 'border-slate-200 bg-slate-100 text-slate-500'
                }
              >
                {patient.status === 'ACTIVE' ? 'Active' : 'Voided'}
              </Badge>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
              <div>
                <p className="text-xs text-slate-400 uppercase">Age</p>
                <p className="text-slate-700">{calculateAge(patient.dob)} years</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 uppercase">Gender</p>
                <p className="text-slate-700 capitalize">{patient.gender.toLowerCase()}</p>
              </div>
              <div>
                <p className="flex items-center gap-1 text-xs text-slate-400 uppercase">
                  <Droplet className="size-3" /> Blood group
                </p>
                <p className="text-slate-700">{patient.bloodGroup ?? 'Unknown'}</p>
              </div>
              <div>
                <p className="flex items-center gap-1 text-xs text-slate-400 uppercase">
                  <Phone className="size-3" /> Phone
                </p>
                <p className="text-slate-700">{patient.phone || '—'}</p>
              </div>
              <div>
                <p className="flex items-center gap-1 text-xs text-slate-400 uppercase">
                  <Mail className="size-3" /> Email
                </p>
                <p className="text-slate-700">{patient.email || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 uppercase">Emergency contact</p>
                <p className="text-slate-700">
                  {patient.emergencyContact?.name
                    ? `${patient.emergencyContact.name} · ${patient.emergencyContact.phone ?? '—'}`
                    : '—'}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ---------- Encounters / Lab Results / Invoices tabs ---------- */}
      <Tabs defaultValue="encounters">
        <TabsList>
          <TabsTrigger value="encounters">Encounters</TabsTrigger>
          <TabsTrigger value="labs">Lab Results</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
        </TabsList>
        <TabsContent value="encounters">
          {timeline!.encounters.length === 0 ? (
            <EmptyState
              icon={ClipboardPlus}
              title="No encounters yet"
              description="Clinical visits for this patient will appear here once the Clinical Workspace step is built."
            />
          ) : (
            <ComingSoonList count={timeline!.encounters.length} label="encounter(s) on record" />
          )}
        </TabsContent>
        <TabsContent value="labs">
          {timeline!.labOrders.length === 0 ? (
            <EmptyState
              icon={FlaskConical}
              title="No lab results yet"
              description="Released lab results for this patient will appear here once the Labs step is built."
            />
          ) : (
            <ComingSoonList count={timeline!.labOrders.length} label="lab order(s) on record" />
          )}
        </TabsContent>
        <TabsContent value="invoices">
          {timeline!.invoices.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="No invoices yet"
              description="Billing for this patient will appear here once the Billing step is built."
            />
          ) : (
            <ComingSoonList count={timeline!.invoices.length} label="invoice(s) on record" />
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
