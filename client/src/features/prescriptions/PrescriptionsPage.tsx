import { useMemo, useState } from 'react'
import { Pill, Receipt } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/features/auth/useAuth'
import { usePrescriptions, useDispensePrescription } from './api'
import { useCreateInvoice, useInvoiceForPrescription } from '@/features/invoices/api'
import { STANDARD_MEDICATION_FEE } from '@/lib/money'
import { getApiErrorMessage } from '@/lib/api'
import { formatDateTime } from '@/lib/date'
import type { Prescription } from '@/types/prescription'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/StatusBadge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/EmptyState'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

// A short "Amoxicillin, Paracetamol +1 more" summary for the table row —
// the full list (with dose/frequency/duration/instructions) only shows in
// the detail dialog.
function medicationsSummary(prescription: Prescription): string {
  const names = prescription.medications.map((m) => m.drugName)
  if (names.length <= 2) return names.join(', ')
  return `${names.slice(0, 2).join(', ')} +${names.length - 2} more`
}

function PrescriptionDetailDialog({
  prescription,
  onOpenChange,
}: {
  prescription: Prescription | null
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={prescription !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {prescription && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <DialogTitle>
                  {prescription.patient.firstName} {prescription.patient.lastName}
                </DialogTitle>
                <StatusBadge status={prescription.status} />
              </div>
              <DialogDescription>
                {prescription.prescriptionNumber} · Dr. {prescription.doctor.firstName} {prescription.doctor.lastName} ·{' '}
                {formatDateTime(prescription.createdAt)}
              </DialogDescription>
            </DialogHeader>

            <ul className="space-y-2">
              {prescription.medications.map((m, i) => (
                <li key={i} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-slate-900">{m.drugName}</p>
                    <span className="text-xs text-slate-600">{m.dosage}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-700">
                    {m.frequency} · {m.duration}
                  </p>
                  {m.instructions && <p className="mt-1 text-xs text-slate-600">{m.instructions}</p>}
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap items-center gap-2">
              <PrescriptionActions prescription={prescription} />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

// One patient's prescriptions grouped together — every drug they've been
// prescribed, across every prescription, visible under one row. There's
// no server-side grouping to mirror here (unlike a lab order, which
// already bundles its tests into one document): this just groups the
// already-fetched flat list client-side by patient id.
interface PatientPrescriptionGroup {
  patient: Prescription['patient']
  prescriptions: Prescription[]
}

function groupByPatient(prescriptions: Prescription[]): PatientPrescriptionGroup[] {
  const byPatientId = new Map<string, PatientPrescriptionGroup>()
  for (const rx of prescriptions) {
    const existing = byPatientId.get(rx.patient._id)
    if (existing) existing.prescriptions.push(rx)
    else byPatientId.set(rx.patient._id, { patient: rx.patient, prescriptions: [rx] })
  }
  return [...byPatientId.values()]
}

// One prescription's full detail — medications, who wrote it, when, and
// its own independent Dispense/Bill actions. Used both by the single-
// prescription dialog (Doctor's/Patient's own flat view) and, as a list
// item, by PatientPrescriptionsDialog below (Admin/Pharmacist's grouped
// view) — dispensing and billing always happen per prescription, so
// grouping several under one patient can never merge that action away.
// Bills this prescription at Sana's standard per-medication fee.
// Self-contained: fetches its own already-billed state and renders nothing
// once an invoice exists (or the prescription is CANCELLED), so every
// caller just needs to gate on the 'invoice.create' permission and nothing
// else — same shape as labOrders/LabOrdersPage.tsx's BillLabOrderButton.
export function BillPrescriptionButton({ prescription, iconOnly }: { prescription: Prescription; iconOnly?: boolean }) {
  const createInvoice = useCreateInvoice()
  const { data: invoice } = useInvoiceForPrescription(prescription._id)

  if (invoice || prescription.status === 'CANCELLED') return null

  async function handleBill() {
    try {
      const created = await createInvoice.mutateAsync({
        prescription: prescription._id,
        items: prescription.medications.map((m) => ({
          description: `${m.drugName} (${m.dosage})`,
          qty: 1,
          unitPrice: STANDARD_MEDICATION_FEE,
        })),
      })
      toast.success(`${created.invoiceNumber} created`)
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  return iconOnly ? (
    <Button
      type="button"
      size="icon-sm"
      variant="ghost"
      aria-label="Bill this prescription"
      disabled={createInvoice.isPending}
      onClick={handleBill}
    >
      <Receipt className="size-3.5" />
    </Button>
  ) : (
    <Button size="sm" variant="outline" disabled={createInvoice.isPending} onClick={handleBill}>
      {createInvoice.isPending ? 'Billing…' : 'Bill this prescription'}
    </Button>
  )
}

function PrescriptionActions({ prescription }: { prescription: Prescription }) {
  const { hasPermission } = useAuth()
  const dispense = useDispensePrescription()
  const { data: invoice } = useInvoiceForPrescription(prescription._id)
  const canDispense = hasPermission('prescription.dispense')
  const canBill = hasPermission('invoice.create')

  async function handleDispense() {
    try {
      await dispense.mutateAsync(prescription._id)
      toast.success(`${prescription.prescriptionNumber} dispensed`)
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  return (
    <>
      {invoice && <StatusBadge status={invoice.status} />}
      {canDispense && prescription.status === 'PRESCRIBED' && (
        <Button size="sm" disabled={dispense.isPending} onClick={handleDispense}>
          {dispense.isPending ? 'Dispensing…' : 'Dispense'}
        </Button>
      )}
      {canBill && <BillPrescriptionButton prescription={prescription} />}
    </>
  )
}

// Opened from a patient's row in the Admin/Pharmacist grouped view —
// mirrors LabOrderDetailDialog's shape (a list of individually-actionable
// items under one patient/order), rather than trying to cram every
// prescription's actions into the summary row itself.
function PatientPrescriptionsDialog({
  group,
  onOpenChange,
}: {
  group: PatientPrescriptionGroup | null
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={group !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        {group && (
          <>
            <DialogHeader>
              <DialogTitle>
                {group.patient.firstName} {group.patient.lastName}
              </DialogTitle>
              <DialogDescription>
                {group.prescriptions.length} prescription{group.prescriptions.length === 1 ? '' : 's'}
              </DialogDescription>
            </DialogHeader>
            <ul className="space-y-3">
              {group.prescriptions.map((rx) => (
                <li key={rx._id} className="rounded-lg border border-border bg-slate-50/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-xs text-slate-600">{rx.prescriptionNumber}</span>
                    <StatusBadge status={rx.status} />
                  </div>
                  <p className="mt-1 text-xs text-slate-600">
                    Dr. {rx.doctor.firstName} {rx.doctor.lastName} · {formatDateTime(rx.createdAt)}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {rx.medications.map((m, i) => (
                      <Badge key={i} variant="outline" className="border-slate-200 bg-white text-slate-700">
                        {m.drugName} · {m.dosage}
                      </Badge>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <PrescriptionActions prescription={rx} />
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function PrescriptionsPage() {
  const { user } = useAuth()
  const { data: prescriptions, isLoading } = usePrescriptions()
  const [selected, setSelected] = useState<Prescription | null>(null)
  const [selectedGroup, setSelectedGroup] = useState<PatientPrescriptionGroup | null>(null)
  // Same distinction as LabOrdersPage's seesEveryOrder — Admin/Pharmacist
  // see the whole queue, a Doctor only sees their own, a Patient only
  // their own (see prescription.service.ts's listPrescriptions).
  const seesEveryPrescription = user?.role.name === 'ADMIN' || user?.role.name === 'PHARMACIST'
  // Grouped-by-patient view applies to everyone except a Patient looking
  // at their own list — that list only ever has one patient in it
  // (themselves), so grouping would just be a single pointless row. A
  // Doctor's own queue can repeat a patient's name just as easily as the
  // full Admin/Pharmacist queue can (e.g. writing two separate
  // prescriptions on the same visit, as happened here), so it gets the
  // same treatment.
  const showGrouped = user?.role.name !== 'PATIENT'
  const groups = useMemo(() => groupByPatient(prescriptions ?? []), [prescriptions])

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        {seesEveryPrescription ? 'Every prescription in the system.' : 'Your own prescriptions.'}
      </p>

      <div className="rounded-lg border border-border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 hover:bg-slate-50">
              <TableHead>Patient</TableHead>
              <TableHead>Doctor</TableHead>
              <TableHead>Medications</TableHead>
              {!showGrouped && <TableHead>Status</TableHead>}
              <TableHead>Written</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 5 }).map((__, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}

            {/* Everyone except a Patient viewing their own list: one row
                per patient, every drug they've been prescribed shown
                together (see groupByPatient above) — click opens
                PatientPrescriptionsDialog to act on any one of them
                individually. */}
            {!isLoading &&
              showGrouped &&
              groups.map((group) => {
                const doctors = new Set(group.prescriptions.map((rx) => rx.doctor._id))
                const latest = group.prescriptions.reduce((max, rx) => (rx.createdAt > max ? rx.createdAt : max), group.prescriptions[0]!.createdAt)
                return (
                  <TableRow
                    key={group.patient._id}
                    className="cursor-pointer hover:bg-slate-50/60"
                    onClick={() => setSelectedGroup(group)}
                  >
                    <TableCell className="font-medium text-slate-900">
                      {group.patient.firstName} {group.patient.lastName}
                    </TableCell>
                    <TableCell className="text-slate-700">
                      {doctors.size === 1
                        ? `Dr. ${group.prescriptions[0]!.doctor.firstName} ${group.prescriptions[0]!.doctor.lastName}`
                        : 'Multiple doctors'}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {group.prescriptions
                          .flatMap((rx) => rx.medications.map((m) => m.drugName))
                          .map((name, i) => (
                            <Badge key={i} variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                              {name}
                            </Badge>
                          ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">{formatDateTime(latest)}</TableCell>
                  </TableRow>
                )
              })}

            {/* Patient's own: unchanged flat, one row per prescription —
                there's only ever one patient in this list (themselves),
                so there's nothing to group. */}
            {!isLoading &&
              !showGrouped &&
              prescriptions?.map((rx) => (
                <TableRow key={rx._id} className="cursor-pointer hover:bg-slate-50/60" onClick={() => setSelected(rx)}>
                  <TableCell className="font-medium text-slate-900">
                    {rx.patient.firstName} {rx.patient.lastName}
                  </TableCell>
                  <TableCell className="text-slate-700">
                    Dr. {rx.doctor.firstName} {rx.doctor.lastName}
                  </TableCell>
                  <TableCell className="text-slate-700">{medicationsSummary(rx)}</TableCell>
                  <TableCell>
                    <StatusBadge status={rx.status} />
                  </TableCell>
                  <TableCell className="text-xs text-slate-600">{formatDateTime(rx.createdAt)}</TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>

        {!isLoading && prescriptions?.length === 0 && (
          <EmptyState
            icon={Pill}
            title="No prescriptions"
            description={seesEveryPrescription ? 'Nothing in the queue yet.' : 'Nothing prescribed yet.'}
          />
        )}
      </div>

      <PrescriptionDetailDialog prescription={selected} onOpenChange={(open) => !open && setSelected(null)} />
      <PatientPrescriptionsDialog group={selectedGroup} onOpenChange={(open) => !open && setSelectedGroup(null)} />
    </div>
  )
}
