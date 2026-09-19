import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Receipt, Plus, Trash2, ChevronLeft, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/features/auth/useAuth'
import { useInvoices, useCreateInvoice } from './api'
import { useLabOrders } from '@/features/labOrders/api'
import { usePrescriptions } from '@/features/prescriptions/api'
import type { LabOrder } from '@/types/labOrder'
import type { Prescription } from '@/types/prescription'
import { getApiErrorMessage } from '@/lib/api'
import { isPopulated } from '@/lib/utils'
import { formatMoney, STANDARD_LAB_TEST_FEE, STANDARD_MEDICATION_FEE } from '@/lib/money'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { StatusBadge } from '@/components/StatusBadge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/EmptyState'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Combobox } from '@/components/Combobox'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'

export function labOrderLabel(order: LabOrder) {
  const tests = order.tests.map((t) => t.testName).join(', ')
  return `${order.patient.firstName} ${order.patient.lastName} — ${tests} (${order.labOrderNumber})`
}

export function prescriptionLabel(rx: Prescription) {
  const drugs = rx.medications.map((m) => m.drugName).join(', ')
  return `${rx.patient.firstName} ${rx.patient.lastName} — ${drugs} (${rx.prescriptionNumber})`
}

// A searchable picker for one of the two billable-thing types (lab orders,
// prescriptions), used instead of a plain dropdown now that either list has
// grown too long to scroll through comfortably (see PatientCombobox for the
// same reasoning applied to patients). It's built on the same shared
// Combobox component (@/components/Combobox). Neither GET /lab-orders nor
// GET /prescriptions has a search option or pagination — each just returns
// every record the current user can see in one go — so instead of adding a
// second network request with a search box, this filters the list that's
// already been fetched, right in the browser. The match is a simple
// case-insensitive "does this text contain what was typed" check, not a
// fuzzy search. A fuzzy search would happily match unrelated names (for
// example "Michael Acheampong" showing up for a "Mercy" search, since both
// names contain the same letters in the same order somewhere), which would
// be confusing for a picker whose whole purpose is to find one exact
// record quickly. LabOrderCombobox and PrescriptionCombobox below are both
// just this component wired to their own data hook, label function, and
// wording — the filtering/selected-label logic itself lives in one place.
function BillableCombobox<T>({
  value,
  onChange,
  items,
  getId,
  getLabel,
  getPatientNumber,
  triggerPlaceholder,
  inputPlaceholder,
  emptyText,
}: {
  value: string
  onChange: (id: string) => void
  items: T[] | undefined
  getId: (item: T) => string
  getLabel: (item: T) => string
  getPatientNumber: (item: T) => string
  triggerPlaceholder: string
  inputPlaceholder: string
  emptyText: string
}) {
  const [search, setSearch] = useState('')
  // Same reasoning as PatientCombobox's selectedLabel: `filtered` below can
  // stop containing the currently selected item once the search text
  // changes, which would otherwise make the trigger button's label go
  // blank even though `value` is still set.
  const [selectedLabel, setSelectedLabel] = useState('')

  const query = search.trim().toLowerCase()
  const filtered = items?.filter((item) => {
    if (!query) return true
    return `${getLabel(item)} ${getPatientNumber(item)}`.toLowerCase().includes(query)
  })

  return (
    <Combobox
      value={value}
      onChange={(id, item) => {
        setSelectedLabel(getLabel(item))
        onChange(id)
      }}
      items={filtered}
      getId={getId}
      getLabel={getLabel}
      search={search}
      onSearchChange={setSearch}
      triggerPlaceholder={triggerPlaceholder}
      inputPlaceholder={inputPlaceholder}
      emptyText={emptyText}
      selectedLabel={value ? selectedLabel : undefined}
    />
  )
}

function LabOrderCombobox({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { data: labOrders } = useLabOrders()
  return (
    <BillableCombobox
      value={value}
      onChange={onChange}
      items={labOrders}
      getId={(order) => order._id}
      getLabel={labOrderLabel}
      getPatientNumber={(order) => order.patient.patientNumber}
      triggerPlaceholder="Select a lab order to bill"
      inputPlaceholder="Search by patient, test, or order number…"
      emptyText="No lab orders found."
    />
  )
}

function PrescriptionCombobox({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { data: prescriptions } = usePrescriptions()
  return (
    <BillableCombobox
      value={value}
      onChange={onChange}
      items={prescriptions}
      getId={(rx) => rx._id}
      getLabel={prescriptionLabel}
      getPatientNumber={(rx) => rx.patient.patientNumber}
      triggerPlaceholder="Select a prescription to bill"
      inputPlaceholder="Search by patient, drug, or prescription number…"
      emptyText="No prescriptions found."
    />
  )
}

// Exactly one of labOrder/prescription is required, matching whichever
// `source` toggle is selected — same "which billable thing" split as the
// server's createInvoiceSchema refine.
const invoiceFormSchema = z
  .object({
    source: z.enum(['LAB_ORDER', 'PRESCRIPTION']),
    labOrder: z.string().trim().optional(),
    prescription: z.string().trim().optional(),
    items: z
      .array(
        z.object({
          description: z.string().trim().min(1, 'Required'),
          qty: z.coerce.number().int().min(1, 'Min 1'),
          unitPrice: z.coerce.number().min(0, 'Min 0'),
        }),
      )
      .min(1),
  })
  .superRefine((data, ctx) => {
    if (data.source === 'LAB_ORDER' && !data.labOrder) {
      ctx.addIssue({ code: 'custom', message: 'Required', path: ['labOrder'] })
    }
    if (data.source === 'PRESCRIPTION' && !data.prescription) {
      ctx.addIssue({ code: 'custom', message: 'Required', path: ['prescription'] })
    }
  })
type InvoiceForm = z.infer<typeof invoiceFormSchema>

const PAGE_SIZE = 20

// Available to Admin or Lab Tech (see permissions.ts). A Lab Tech typically bills
// the order right after they process it, but an Admin can also generate an
// invoice directly from here. The lab order is chosen from a real dropdown (backed
// by GET /lab-orders) rather than requiring anyone to type or paste an ID by hand.
// Picking an order automatically fills in one line item per test on that order,
// priced at Sana's standard fee (see STANDARD_LAB_TEST_FEE above), so nobody has
// to price anything manually.
function CreateInvoiceDialog() {
  const [open, setOpen] = useState(false)
  const createInvoice = useCreateInvoice()
  const navigate = useNavigate()
  const { data: labOrders } = useLabOrders()
  const { data: prescriptions } = usePrescriptions()
  // The effects below read labOrders/prescriptions through refs rather than listing
  // them as a dependency directly. That's because each becomes a brand-new array
  // every time it's refetched in the background (like when the browser tab regains
  // focus, or another tab changes something). If an effect depended on the list
  // directly, it would re-run on every one of those refetches and quietly erase
  // any manual edits the person billing has already made to the line items.
  const labOrdersRef = useRef(labOrders)
  labOrdersRef.current = labOrders
  const prescriptionsRef = useRef(prescriptions)
  prescriptionsRef.current = prescriptions

  const form = useForm<InvoiceForm>({
    resolver: zodResolver(invoiceFormSchema),
    defaultValues: { source: 'LAB_ORDER', labOrder: '', prescription: '', items: [] },
  })
  const { fields, append, remove, replace } = useFieldArray({ control: form.control, name: 'items' })
  const items = form.watch('items')
  const source = form.watch('source')
  const selectedLabOrderId = form.watch('labOrder')
  const selectedPrescriptionId = form.watch('prescription')
  const subtotal = items.reduce((sum, item) => sum + (Number(item.qty) || 0) * (Number(item.unitPrice) || 0), 0)

  // Whenever the selected lab order changes, this replaces the whole item list
  // rather than adding to it, so switching to a different order never leaves
  // old lines behind from the previous one. The person billing can still freely
  // edit, remove, or add lines afterward — this just sets the starting point.
  // This effect only depends on the selected order id, not on `labOrders` itself
  // (see labOrdersRef above), so it only resets the lines when someone actually
  // picks a different order. The full list of orders is already loaded for the
  // combobox above, so the selected order's tests are read straight out of that
  // list instead of making another network request.
  useEffect(() => {
    if (source !== 'LAB_ORDER' || !selectedLabOrderId) return
    const order = labOrdersRef.current?.find((o) => o._id === selectedLabOrderId)
    const testLines = (order?.tests ?? []).map((t) => ({
      description: t.testName,
      qty: 1,
      unitPrice: STANDARD_LAB_TEST_FEE,
    }))
    replace(testLines)
  }, [source, selectedLabOrderId, replace])

  // Same idea, one line per medication, priced at STANDARD_MEDICATION_FEE.
  useEffect(() => {
    if (source !== 'PRESCRIPTION' || !selectedPrescriptionId) return
    const rx = prescriptionsRef.current?.find((p) => p._id === selectedPrescriptionId)
    const medicationLines = (rx?.medications ?? []).map((m) => ({
      description: `${m.drugName} (${m.dosage})`,
      qty: 1,
      unitPrice: STANDARD_MEDICATION_FEE,
    }))
    replace(medicationLines)
  }, [source, selectedPrescriptionId, replace])

  async function onSubmit(values: InvoiceForm) {
    try {
      const invoice = await createInvoice.mutateAsync({
        ...(values.source === 'LAB_ORDER' ? { labOrder: values.labOrder } : { prescription: values.prescription }),
        items: values.items,
      })
      toast.success(`${invoice.invoiceNumber} created`)
      setOpen(false)
      navigate(`/invoices/${invoice._id}`)
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) form.reset({ source: 'LAB_ORDER', labOrder: '', prescription: '', items: [] })
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> Create invoice
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create an invoice</DialogTitle>
          <DialogDescription>
            {source === 'LAB_ORDER'
              ? `Pick the lab order to bill — its tests are added automatically at ${formatMoney(STANDARD_LAB_TEST_FEE)} each.`
              : `Pick the prescription to bill — its medications are added automatically at ${formatMoney(STANDARD_MEDICATION_FEE)} each.`}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="source"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Bill for</FormLabel>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={field.value === 'LAB_ORDER' ? 'default' : 'outline'}
                      onClick={() => field.onChange('LAB_ORDER')}
                    >
                      Lab order
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={field.value === 'PRESCRIPTION' ? 'default' : 'outline'}
                      onClick={() => field.onChange('PRESCRIPTION')}
                    >
                      Prescription
                    </Button>
                  </div>
                </FormItem>
              )}
            />
            {source === 'LAB_ORDER' ? (
              <FormField
                control={form.control}
                name="labOrder"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lab order</FormLabel>
                    <FormControl>
                      <LabOrderCombobox value={field.value ?? ''} onChange={field.onChange} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : (
              <FormField
                control={form.control}
                name="prescription"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prescription</FormLabel>
                    <FormControl>
                      <PrescriptionCombobox value={field.value ?? ''} onChange={field.onChange} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <div className="space-y-2">
              <FormLabel>Line items</FormLabel>
              {fields.map((field, index) => (
                <div key={field.id} className="grid grid-cols-[1fr_4.5rem_6rem_auto] items-start gap-2">
                  <FormField
                    control={form.control}
                    name={`items.${index}.description`}
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Input placeholder="Line item description" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`items.${index}.qty`}
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Input type="number" min={1} placeholder="Qty" {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`items.${index}.unitPrice`}
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Input type="number" min={0} step="0.01" placeholder="Price" {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={fields.length === 1}
                    onClick={() => remove(index)}
                    aria-label="Remove line item"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ description: '', qty: 1, unitPrice: 0 })}
              >
                <Plus className="size-4" /> Add line
              </Button>
            </div>

            <div className="flex items-center justify-between rounded-md bg-secondary/60 px-3 py-2 text-sm">
              <span className="text-slate-600">Subtotal</span>
              <span className="tabular-nums font-semibold text-slate-900">{formatMoney(subtotal)}</span>
            </div>

            <DialogFooter>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? 'Creating…' : 'Create invoice'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

export function InvoicesPage() {
  const navigate = useNavigate()
  const { hasPermission } = useAuth()
  const [page, setPage] = useState(1)
  const { data: invoices, isLoading } = useInvoices(page, PAGE_SIZE)
  const canCreate = hasPermission('invoice.create')
  // Only an Admin's call to listInvoices() actually returns the full list of every
  // invoice (a Lab Tech's call returns nothing here, since they bill individual
  // orders from the Lab Order dialog instead of this page, and a Patient only sees
  // their own invoices). This is checked separately from `canCreate`, because both
  // Admin and Lab Tech are allowed to create invoices, but only an Admin should see
  // the full-ledger wording and columns above what would otherwise be an empty table
  // for a Lab Tech. Checked via the 'user.manage' permission (Admin-exclusive, see
  // types/permissions.ts) rather than the role name directly, so this stays
  // correct if a future role's permissions ever change without also touching this page.
  const isAdmin = hasPermission('user.manage')
  const hasNextPage = (invoices?.length ?? 0) === PAGE_SIZE

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">{isAdmin ? 'Every invoice in the system.' : 'Your invoices.'}</p>
        {canCreate && <CreateInvoiceDialog />}
      </div>

      <div className="rounded-lg border border-border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 hover:bg-slate-50">
              <TableHead>Invoice</TableHead>
              {isAdmin && (
                <TableHead>Patient</TableHead>
              )}
              <TableHead>Total</TableHead>
              <TableHead>Balance</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: isAdmin ? 5 : 4 }).map((__, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}

            {!isLoading &&
              invoices?.map((invoice) => (
                <TableRow
                  key={invoice._id}
                  tabIndex={0}
                  role="link"
                  className="cursor-pointer focus-visible:bg-blue-50 focus-visible:outline-none"
                  onClick={() => navigate(`/invoices/${invoice._id}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      navigate(`/invoices/${invoice._id}`)
                    }
                  }}
                >
                  <TableCell className="font-mono text-xs text-slate-600">{invoice.invoiceNumber}</TableCell>
                  {isAdmin && (
                    <TableCell className="font-medium text-slate-900">
                      {isPopulated(invoice.patient) ? `${invoice.patient.firstName} ${invoice.patient.lastName}` : '—'}
                    </TableCell>
                  )}
                  <TableCell className="tabular-nums text-slate-700">{formatMoney(invoice.total)}</TableCell>
                  <TableCell className="tabular-nums text-slate-700">{formatMoney(invoice.balance)}</TableCell>
                  <TableCell>
                    <StatusBadge status={invoice.status} />
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>

        {!isLoading && invoices?.length === 0 && (
          <EmptyState icon={Receipt} title="No invoices yet" description="Invoices generated from encounters will show up here." />
        )}

        {/* Pagination controls only show for an Admin. When listInvoices() runs for
             a Patient, it never actually splits their invoices into pages on the
             server, so a Patient always gets their complete list back in a single
             response no matter what page or limit is requested. Showing Prev/Next
             buttons to them would be misleading, since it would look like there
             are more pages when there aren't, and could even look broken if they
             happen to have exactly PAGE_SIZE invoices (the "is there a next page"
             check below can't tell that apart from there actually being a page 2). */}
        {!isLoading && isAdmin && invoices && invoices.length > 0 && (
          <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              <ChevronLeft className="size-4" /> Prev
            </Button>
            <Button variant="outline" size="sm" disabled={!hasNextPage} onClick={() => setPage((p) => p + 1)}>
              Next <ChevronRight className="size-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
