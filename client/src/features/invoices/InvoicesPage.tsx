import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Receipt, Plus, Trash2, ChevronLeft, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/features/auth/useAuth'
import { useInvoices, useCreateInvoice } from './api'
import { getApiErrorMessage } from '@/lib/api'
import { isPopulated } from '@/lib/utils'
import { formatMoney } from '@/lib/money'
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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'

const invoiceFormSchema = z.object({
  encounter: z.string().trim().min(1, 'Required'),
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
type InvoiceForm = z.infer<typeof invoiceFormSchema>

const PAGE_SIZE = 20

// Admin-only. Billing has no "browse encounters" entry point anywhere in
// the app — there is no GET /encounters list endpoint on the backend (the
// same gap noted in the Step 4 Clinical Workspace review), and Admin
// doesn't even hold 'encounter.read' to open one directly. The only real
// way to get an encounter's id today is a doctor reading it off the
// /encounters/:id URL and relaying it — so this form asks for that id
// directly rather than pretending a picker exists.
function CreateInvoiceDialog() {
  const [open, setOpen] = useState(false)
  const createInvoice = useCreateInvoice()
  const navigate = useNavigate()

  const form = useForm<InvoiceForm>({
    resolver: zodResolver(invoiceFormSchema),
    defaultValues: { encounter: '', items: [{ description: '', qty: 1, unitPrice: 0 }] },
  })
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'items' })
  const items = form.watch('items')
  const subtotal = items.reduce((sum, item) => sum + (Number(item.qty) || 0) * (Number(item.unitPrice) || 0), 0)

  async function onSubmit(values: InvoiceForm) {
    try {
      const invoice = await createInvoice.mutateAsync(values)
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
        if (next) form.reset({ encounter: '', items: [{ description: '', qty: 1, unitPrice: 0 }] })
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
            Enter the encounter's id (from its /encounters/&lt;id&gt; URL) and the line items to bill.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="encounter"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Encounter ID</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. 66f1a2b3c4d5e6f7a8b9c0d1" className="font-mono text-sm" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

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
                          <Input placeholder="Consultation fee" {...field} />
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
              <span className="text-slate-500">Subtotal</span>
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
  const hasNextPage = (invoices?.length ?? 0) === PAGE_SIZE

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{canCreate ? 'Every invoice in the system.' : 'Your invoices.'}</p>
        {canCreate && <CreateInvoiceDialog />}
      </div>

      <div className="rounded-lg border border-border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 hover:bg-slate-50">
              <TableHead className="text-xs font-medium tracking-wider text-slate-500 uppercase">Invoice</TableHead>
              {canCreate && (
                <TableHead className="text-xs font-medium tracking-wider text-slate-500 uppercase">Patient</TableHead>
              )}
              <TableHead className="text-xs font-medium tracking-wider text-slate-500 uppercase">Total</TableHead>
              <TableHead className="text-xs font-medium tracking-wider text-slate-500 uppercase">Balance</TableHead>
              <TableHead className="text-xs font-medium tracking-wider text-slate-500 uppercase">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: canCreate ? 5 : 4 }).map((__, j) => (
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
                  <TableCell className="font-mono text-xs text-slate-500">{invoice.invoiceNumber}</TableCell>
                  {canCreate && (
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

        {/* Pagination is Admin-only — listInvoices() never actually slices
             a Patient's own list server-side (no .skip()/.limit() in that
             branch), so a Patient always gets their full list in one
             response regardless of `page`/`limit`. Showing Prev/Next to
             them would be misleading at best (implies more pages exist)
             and a dead-looking "Next" click at worst (if they happen to
             have exactly PAGE_SIZE invoices, the heuristic below can't
             tell that from "there's a page 2"). */}
        {!isLoading && canCreate && invoices && invoices.length > 0 && (
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
