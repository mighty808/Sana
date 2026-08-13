import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowLeft, Receipt, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/features/auth/useAuth'
import { useInvoice } from './api'
import { useCreatePayment } from '@/features/payments/api'
import { PAYMENT_METHODS } from '@/types/payment'
import { isPopulated } from '@/lib/utils'
import { formatMoney } from '@/lib/money'
import { getApiErrorMessage } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { StatusBadge } from '@/components/StatusBadge'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/EmptyState'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

type PaymentForm = z.infer<ReturnType<typeof buildPaymentFormSchema>>

// The backend rejects an overpayment (see payment.service.ts's OVERPAYMENT
// check) — this mirrors that same cap client-side, built per-render around
// the invoice's current balance, so a caller gets an instant validation
// message instead of waiting on a round trip for something the UI already
// knows. Kept as a factory (not a module-level constant) since the cap
// depends on `balance`, a runtime value, not something Zod can close over statically.
function buildPaymentFormSchema(balance: number) {
  return z.object({
    amount: z.coerce
      .number()
      .positive('Must be greater than 0')
      .max(balance, `Cannot exceed the outstanding balance of ${balance}`),
    method: z.enum(PAYMENT_METHODS),
    reference: z.string().trim().optional(),
  })
}

function RecordPaymentDialog({ invoiceId, balance }: { invoiceId: string; balance: number }) {
  const [open, setOpen] = useState(false)
  const createPayment = useCreatePayment()
  const form = useForm<PaymentForm>({
    resolver: zodResolver(buildPaymentFormSchema(balance)),
    defaultValues: { amount: balance, method: 'CASH', reference: '' },
  })

  async function onSubmit(values: PaymentForm) {
    try {
      await createPayment.mutateAsync({ invoice: invoiceId, ...values })
      toast.success(`Payment of ${formatMoney(values.amount)} recorded`)
      setOpen(false)
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) form.reset({ amount: balance, method: 'CASH', reference: '' })
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> Record payment
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record a payment</DialogTitle>
          <DialogDescription>Outstanding balance: {formatMoney(balance)}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-4">
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" min={0.01} max={balance} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="method"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Method</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="CASH">Cash</SelectItem>
                        <SelectItem value="CARD">Card</SelectItem>
                        <SelectItem value="MOBILE_MONEY">Mobile Money</SelectItem>
                        <SelectItem value="INSURANCE">Insurance</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="reference"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reference (optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="MoMo transaction id, receipt no…" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? 'Recording…' : 'Record payment'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'Cash',
  CARD: 'Card',
  MOBILE_MONEY: 'Mobile Money',
  INSURANCE: 'Insurance',
}

export function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { hasPermission } = useAuth()
  const { data, isLoading } = useInvoice(id)
  const canRecordPayment = hasPermission('payment.create')

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    )
  }

  if (!data) {
    return <EmptyState icon={Receipt} title="Invoice not found" description="This record may have been removed." />
  }

  const { invoice, payments } = data

  return (
    <div className="space-y-5">
      <Link to="/invoices" className="flex w-fit items-center gap-1.5 text-sm text-slate-500 hover:text-blue-600">
        <ArrowLeft className="size-4" /> Back to Invoices
      </Link>

      {/* ---------- Invoice header ---------- */}
      <Card>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold text-slate-900">{invoice.invoiceNumber}</h2>
              <StatusBadge status={invoice.status} />
            </div>
            {isPopulated(invoice.patient) && (
              <p className="mt-1 text-sm text-slate-500">
                {invoice.patient.firstName} {invoice.patient.lastName} · {invoice.patient.patientNumber}
              </p>
            )}
            <div className="mt-4 grid grid-cols-3 gap-x-8 gap-y-2 text-sm">
              <div>
                <p className="text-xs text-slate-400 uppercase">Total</p>
                <p className="tabular-nums font-semibold text-slate-900">{formatMoney(invoice.total)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 uppercase">Paid</p>
                <p className="tabular-nums font-semibold text-green-700">{formatMoney(invoice.amountPaid)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 uppercase">Balance</p>
                <p className="tabular-nums font-semibold text-slate-900">{formatMoney(invoice.balance)}</p>
              </div>
            </div>
          </div>
          {canRecordPayment && invoice.status !== 'PAID' && invoice.status !== 'VOIDED' && (
            <RecordPaymentDialog invoiceId={invoice._id} balance={invoice.balance} />
          )}
        </CardContent>
      </Card>

      {/* ---------- Line items ---------- */}
      <Card>
        <CardContent>
          <h3 className="mb-3 text-sm font-semibold text-slate-900">Line items</h3>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-xs font-medium tracking-wider text-slate-500 uppercase">Description</TableHead>
                <TableHead className="text-right text-xs font-medium tracking-wider text-slate-500 uppercase">Qty</TableHead>
                <TableHead className="text-right text-xs font-medium tracking-wider text-slate-500 uppercase">Unit price</TableHead>
                <TableHead className="text-right text-xs font-medium tracking-wider text-slate-500 uppercase">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoice.items.map((item, i) => (
                <TableRow key={i} className="hover:bg-transparent">
                  <TableCell className="text-slate-700">{item.description}</TableCell>
                  <TableCell className="tabular-nums text-right text-slate-700">{item.qty}</TableCell>
                  <TableCell className="tabular-nums text-right text-slate-700">{formatMoney(item.unitPrice)}</TableCell>
                  <TableCell className="tabular-nums text-right font-medium text-slate-900">{formatMoney(item.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ---------- Payment history ---------- */}
      <Card>
        <CardContent>
          <h3 className="mb-3 text-sm font-semibold text-slate-900">Payment history</h3>
          {payments.length === 0 ? (
            <p className="text-sm text-slate-500">No payments recorded yet.</p>
          ) : (
            <ul className="space-y-2">
              {payments.map((payment) => (
                <li
                  key={payment._id}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
                      {PAYMENT_METHOD_LABELS[payment.method] ?? payment.method}
                    </Badge>
                    {payment.reference && <span className="text-xs text-slate-500">{payment.reference}</span>}
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-slate-400">
                      {new Date(payment.paidAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                    <span className="tabular-nums font-semibold text-green-700">{formatMoney(payment.amount)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
