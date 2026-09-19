import { useState } from 'react'
import { Pill } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/features/auth/useAuth'
import { usePrescriptions, useDispensePrescription } from './api'
import { useCreateInvoice, useInvoiceForPrescription } from '@/features/invoices/api'
import { STANDARD_MEDICATION_FEE } from '@/lib/money'
import { getApiErrorMessage } from '@/lib/api'
import { formatDateTime } from '@/lib/date'
import type { Prescription } from '@/types/prescription'
import { Button } from '@/components/ui/button'
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
  const { hasPermission } = useAuth()
  const dispense = useDispensePrescription()
  const createInvoice = useCreateInvoice()
  const { data: invoice } = useInvoiceForPrescription(prescription?._id)
  const canDispense = hasPermission('prescription.dispense')
  const canBill = hasPermission('invoice.create')

  async function handleDispense() {
    if (!prescription) return
    try {
      await dispense.mutateAsync(prescription._id)
      toast.success(`${prescription.prescriptionNumber} dispensed`)
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  async function handleBill() {
    if (!prescription) return
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
                {invoice && <StatusBadge status={invoice.status} />}
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

            <div className="flex flex-wrap gap-2">
              {canDispense && prescription.status === 'PRESCRIBED' && (
                <Button size="sm" disabled={dispense.isPending} onClick={handleDispense}>
                  {dispense.isPending ? 'Dispensing…' : 'Dispense'}
                </Button>
              )}
              {canBill && !invoice && prescription.status !== 'CANCELLED' && (
                <Button size="sm" variant="outline" disabled={createInvoice.isPending} onClick={handleBill}>
                  {createInvoice.isPending ? 'Billing…' : 'Bill this prescription'}
                </Button>
              )}
            </div>
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
  // Same distinction as LabOrdersPage's seesEveryOrder — Admin/Pharmacist
  // see the whole queue, a Doctor only sees their own, a Patient only
  // their own (see prescription.service.ts's listPrescriptions).
  const seesEveryPrescription = user?.role.name === 'ADMIN' || user?.role.name === 'PHARMACIST'

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
              <TableHead>Status</TableHead>
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

            {!isLoading &&
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
    </div>
  )
}
