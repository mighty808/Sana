import { useParams, useSearchParams, Link } from 'react-router-dom'
import { ArrowLeft, Phone, Mail, Droplet, ClipboardPlus, FlaskConical, Receipt, ArrowUpRight, Pill } from 'lucide-react'
import { usePatientTimeline } from './api'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { StatusBadge, statusBadgeClassName } from '@/components/StatusBadge'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/EmptyState'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatMoney } from '@/lib/money'
import { formatShortDate } from '@/lib/date'
import { calculateAge } from '@/lib/age'

export function PatientDetailPage() {
  const { id } = useParams<{ id: string }>()
  // The timeline endpoint returns the patient together with their real
  // encounter, lab-order, and invoice history all in one call. Fetching the
  // patient separately through GET /patients/:id too would just be a second
  // network request for data this call already provides.
  const { data: timeline, isLoading } = usePatientTimeline(id)
  const patient = timeline?.patient
  // Lets a caller deep-link straight to a specific tab — e.g. the Invoices
  // page's per-patient group header links to `?tab=invoices` so an admin
  // clicking a patient's name lands on their full invoice history instead
  // of the Encounters tab. Falls back to 'encounters' for anything absent
  // or not one of the four real tab values, rather than trusting an
  // arbitrary query string straight into Tabs' defaultValue.
  const [searchParams] = useSearchParams()
  const requestedTab = searchParams.get('tab')
  const initialTab = ['encounters', 'labs', 'prescriptions', 'invoices'].includes(requestedTab ?? '')
    ? requestedTab!
    : 'encounters'

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
      <Link to="/patients" className="flex w-fit items-center gap-1.5 text-sm text-slate-600 hover:text-blue-600">
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
              <StatusBadge status={patient.status} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
              <div>
                <p className="text-xs text-slate-600 uppercase">Age</p>
                <p className="text-slate-700">{calculateAge(patient.dob)} years</p>
              </div>
              <div>
                <p className="text-xs text-slate-600 uppercase">Gender</p>
                <p className="text-slate-700 capitalize">{patient.gender.toLowerCase()}</p>
              </div>
              <div>
                <p className="flex items-center gap-1 text-xs text-slate-600 uppercase">
                  <Droplet className="size-3" /> Blood group
                </p>
                <p className="text-slate-700">{patient.bloodGroup ?? 'Unknown'}</p>
              </div>
              <div>
                <p className="flex items-center gap-1 text-xs text-slate-600 uppercase">
                  <Phone className="size-3" /> Phone
                </p>
                <p className="text-slate-700">{patient.phone || '—'}</p>
              </div>
              <div>
                <p className="flex items-center gap-1 text-xs text-slate-600 uppercase">
                  <Mail className="size-3" /> Email
                </p>
                <p className="text-slate-700">{patient.email || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-600 uppercase">Emergency contact</p>
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

      {/* ---------- Encounters / Lab Results / Prescriptions / Invoices
           tabs — the patient's full clinical + billing timeline, all
           sourced from the one usePatientTimeline() call above rather than
           a separate fetch per tab. ---------- */}
      <Tabs defaultValue={initialTab}>
        <TabsList>
          <TabsTrigger value="encounters">Encounters</TabsTrigger>
          <TabsTrigger value="labs">Lab Results</TabsTrigger>
          <TabsTrigger value="prescriptions">Prescriptions</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
        </TabsList>
        {/* Each visit that's happened for this patient, newest first (see
            patient.service.ts's getPatientTimeline) — clicking one opens
            its full encounter record. */}
        <TabsContent value="encounters" className="space-y-3">
          {timeline!.encounters.length === 0 ? (
            <EmptyState icon={ClipboardPlus} title="No encounters yet" description="Clinical visits for this patient will appear here." />
          ) : (
            timeline!.encounters.map((enc) => (
              <Link
                key={enc._id}
                to={`/encounters/${enc._id}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 shadow-sm transition-colors hover:bg-slate-50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">{enc.chiefComplaint}</p>
                  <p className="mt-0.5 text-xs text-slate-600">
                    Dr. {enc.doctor.firstName} {enc.doctor.lastName} · {formatShortDate(enc.startedAt)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusBadge status={enc.status} />
                  <ArrowUpRight className="size-4 text-slate-600" />
                </div>
              </Link>
            ))
          )}
        </TabsContent>
        {/* One card per lab order, showing every test on it as a small
            badge — statusBadgeClassName colors each badge by that
            individual test's own PENDING/COMPLETED status, since a single
            order can have some tests done and others still pending, unlike
            StatusBadge below (which colors a whole record by one status). */}
        <TabsContent value="labs" className="space-y-3">
          {timeline!.labOrders.length === 0 ? (
            <EmptyState icon={FlaskConical} title="No lab orders yet" description="Lab tests ordered for this patient will appear here." />
          ) : (
            timeline!.labOrders.map((order) => (
              <div key={order._id} className="rounded-lg border border-border bg-card p-3 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-xs text-slate-600">{order.labOrderNumber}</span>
                  <StatusBadge status={order.status} />
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {order.tests.map((t) => (
                    <Badge key={t.testName} variant="outline" className={statusBadgeClassName(t.status)}>
                      {t.testName}
                    </Badge>
                  ))}
                </div>
                <p className="mt-2 text-xs text-slate-600">{formatShortDate(order.orderedAt)}</p>
              </div>
            ))
          )}
        </TabsContent>
        {/* Same one-card-per-record shape as the lab tab above, one badge
            per medication. Unlike a lab order's per-test badges, a
            medication has no per-item status of its own to color by (see
            types/prescription.ts's MedicationItem) — the whole prescription
            dispenses as a single action — so these are plain, uncolored
            badges naming each drug, and `rx.status` covers the record as a
            whole via the StatusBadge above them instead. Keyed by array
            index rather than drug name since the same drug could
            legitimately appear twice on one prescription (e.g. a morning
            and an evening dose written as separate lines). */}
        <TabsContent value="prescriptions" className="space-y-3">
          {timeline!.prescriptions.length === 0 ? (
            <EmptyState icon={Pill} title="No prescriptions yet" description="Medications prescribed for this patient will appear here." />
          ) : (
            timeline!.prescriptions.map((rx) => (
              <div key={rx._id} className="rounded-lg border border-border bg-card p-3 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-xs text-slate-600">{rx.prescriptionNumber}</span>
                  <StatusBadge status={rx.status} />
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {rx.medications.map((m, i) => (
                    <Badge key={i} variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                      {m.drugName}
                    </Badge>
                  ))}
                </div>
                <p className="mt-2 text-xs text-slate-600">{formatShortDate(rx.createdAt)}</p>
              </div>
            ))
          )}
        </TabsContent>
        {/* Every invoice raised for this patient, newest first — clicking
            one opens the full invoice detail page (line items, payments,
            balance). */}
        <TabsContent value="invoices" className="space-y-3">
          {timeline!.invoices.length === 0 ? (
            <EmptyState icon={Receipt} title="No invoices yet" description="Billing for this patient will appear here." />
          ) : (
            timeline!.invoices.map((invoice) => (
              <Link
                key={invoice._id}
                to={`/invoices/${invoice._id}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 shadow-sm transition-colors hover:bg-slate-50"
              >
                <div>
                  <p className="font-mono text-xs text-slate-600">{invoice.invoiceNumber}</p>
                  <p className="mt-0.5 text-sm font-medium text-slate-900">{formatMoney(invoice.total)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusBadge status={invoice.status} />
                  <ArrowUpRight className="size-4 text-slate-600" />
                </div>
              </Link>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
