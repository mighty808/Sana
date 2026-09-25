import { useMemo, useState, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  FlaskConical,
  PlusCircle,
  Send,
  Sparkles,
  Clock,
  Hourglass,
  AlertTriangle,
  Printer,
  Pencil,
  Trash2,
  ChevronDown,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/features/auth/useAuth'
import { useLabOrders, useLabOrder, useUpdateLabOrder, useDeleteLabOrder } from './api'
import { useCreateLabResult, useReleaseLabResult } from '@/features/labResults/api'
import { useInvoiceForLabOrder, useCreateInvoice } from '@/features/invoices/api'
import { useExplainLabResult, useLabOrderResultAnalyses } from '@/features/ai/api'
import { useAiAction } from '@/features/ai/useAiAction'
import { STANDARD_LAB_TEST_FEE } from '@/lib/money'
import { matchTestsToResults } from '@/lib/labOrder'
import { formatShortDate } from '@/lib/date'
import { LAB_ORDER_STATUSES, LAB_ORDER_PRIORITIES, type LabOrder, type LabOrderStatus, type LabTestItem } from '@/types/labOrder'
import { LAB_RESULT_INTERPRETATIONS, type LabResult } from '@/types/labResult'
import type { AiConsultation } from '@/types/aiConsultation'
import { getApiErrorMessage } from '@/lib/api'
import { AiResponseCard } from '@/components/AiResponseCard'
import { AiUnavailableBanner } from '@/components/AiUnavailableBanner'
import { StatCard } from '@/components/StatCard'
import { PrintArea } from '@/components/PrintArea'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { StatusBadge, statusBadgeClassName } from '@/components/StatusBadge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/EmptyState'
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

const resultFormSchema = z.object({
  testName: z.string().min(1, 'Select a test'),
  resultValue: z.string().trim().min(1, 'Required'),
  unit: z.string().trim().optional(),
  referenceRange: z.string().trim().optional(),
  interpretation: z.enum(LAB_RESULT_INTERPRETATIONS).optional(),
  notes: z.string().trim().optional(),
})
type ResultForm = z.infer<typeof resultFormSchema>

// Only available to a Lab Tech (they hold the 'labresult.create' permission).
// This lets them enter a result for one test on this order that is still
// PENDING. It's only shown when the order has at least one PENDING test left,
// since a fully COMPLETED order has nothing left to enter. It's placed directly
// inside LabOrderDetailDialog's already-open content, rather than as a table
// row button or a second dialog stacked on top of the first, so entering a
// result and releasing it can both happen in the same window without opening
// another popup.
function EnterResultForm({ order }: { order: LabOrder }) {
  const [open, setOpen] = useState(false)
  const createResult = useCreateLabResult()
  const pendingTests = order.tests.filter((t) => t.status === 'PENDING')

  const form = useForm<ResultForm>({
    resolver: zodResolver(resultFormSchema),
    defaultValues: {
      testName: pendingTests[0]?.testName ?? '',
      resultValue: '',
      unit: '',
      referenceRange: '',
      notes: '',
    },
  })

  async function onSubmit(values: ResultForm) {
    try {
      await createResult.mutateAsync({ ...values, labOrder: order._id })
      toast.success(`Result entered for ${values.testName}`)
      setOpen(false)
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  if (pendingTests.length === 0) return null

  if (!open) {
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          form.reset({
            testName: pendingTests[0]?.testName ?? '',
            resultValue: '',
            unit: '',
            referenceRange: '',
            notes: '',
          })
          setOpen(true)
        }}
      >
        <PlusCircle className="size-4" /> Enter result
      </Button>
    )
  }

  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      <div>
        <p className="text-sm font-medium text-slate-900">Enter a lab result</p>
        <p className="text-xs text-slate-600">
          {order.labOrderNumber} · {order.patient.firstName} {order.patient.lastName}
        </p>
      </div>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="testName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Test</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a pending test" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {pendingTests.map((t) => (
                      <SelectItem key={t.testName} value={t.testName}>
                        {t.testName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          {/* Result gets its own full-width row — it's the field that
              actually matters, and needs the room for longer values (e.g.
              titers like "O:1:40, H:1:80"). Unit/Reference range are a
              secondary pair below it; Interpretation is its own row rather
              than sharing a cell with three other fields of very different
              importance. */}
          <FormField
            control={form.control}
            name="resultValue"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Result</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. Positive, 14.2" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="grid grid-cols-2 gap-x-4 gap-y-4">
            <FormField
              control={form.control}
              name="unit"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Unit (optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="g/dL" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="referenceRange"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reference range (optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="13.0–17.0" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name="interpretation"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Interpretation (optional)</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {LAB_RESULT_INTERPRETATIONS.map((i) => (
                      <SelectItem key={i} value={i}>
                        {i.charAt(0) + i.slice(1).toLowerCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Notes (optional)</FormLabel>
                <FormControl>
                  <Textarea rows={2} {...field} />
                </FormControl>
              </FormItem>
            )}
          />
          <div className="flex gap-2">
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? 'Saving…' : 'Save result'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </Form>
    </div>
  )
}

// Only available to a Lab Tech (they hold the 'ai.explainLabResult' permission,
// which is different from the Doctor-only 'ai.consult' permission). This asks
// Sana AI to explain one entered result in plain language (see
// server/src/services/ai.service.ts's explainLabResult). The `analyses` prop,
// which holds this result's past explanations, is passed down from
// LabOrderDetailDialog. That parent component fetches the explanation history
// for every result on the whole order in a single batched call
// (useLabOrderResultAnalyses) instead of having each result make its own
// separate request — see ai/api.ts. There are no accept/ignore review buttons
// here, since reviewing AI output stays the doctor's job alone.
// A closed-by-default disclosure for one result's past AI explanations.
// Deliberately NOT the same bordered/tinted CollapsibleConsultationGroup
// bar the doctor's and nurse's own AI history use elsewhere — this can
// appear once per test on an order, and three of those full-width bars
// stacked back to back overwhelmed the dialog. A plain text toggle keeps
// the collapsed state visually quiet; the expanded content still uses the
// same blue-tinted card treatment as everywhere else once there's
// actually something to look at. `basis-full` is what lets this sit
// inside LabResultAiExplain's flex-wrap button row below and still force
// itself onto its own line rather than squeezing next to the buttons.
function PastExplanationsToggle({ analyses }: { analyses: AiConsultation[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="basis-full">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-800"
      >
        Past explanations ({analyses.length})
        <ChevronDown className={`size-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {analyses.map((consultation) => (
            <div key={consultation._id} className="rounded-lg border border-blue-200 bg-blue-50/60 p-4">
              <AiResponseCard consultation={consultation} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Only available to a Lab Tech (they hold the 'ai.explainLabResult' permission,
// which is different from the Doctor-only 'ai.consult' permission). This asks
// Sana AI to explain one entered result in plain language (see
// server/src/services/ai.service.ts's explainLabResult). The `analyses` prop,
// which holds this result's past explanations, is passed down from
// LabOrderDetailDialog. That parent component fetches the explanation history
// for every result on the whole order in a single batched call
// (useLabOrderResultAnalyses) instead of having each result make its own
// separate request — see ai/api.ts. There are no accept/ignore review buttons
// here, since reviewing AI output stays the doctor's job alone.
//
// `releaseButton` is threaded in from the caller rather than rendered
// alongside this component, so Release and Explain result end up as two
// buttons in the same row instead of two separate stacked blocks.
function LabResultAiExplain({
  result,
  labOrderId,
  analyses,
  releaseButton,
}: {
  result: LabResult
  labOrderId: string
  analyses: AiConsultation[]
  releaseButton?: ReactNode
}) {
  const explainResult = useExplainLabResult()
  const { unavailable, run } = useAiAction(explainResult.mutateAsync)

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {releaseButton}
      <Button
        size="sm"
        variant="outline"
        disabled={explainResult.isPending}
        onClick={() => run({ labResult: result._id, labOrder: labOrderId })}
      >
        <Sparkles className="size-4" /> {explainResult.isPending ? 'Explaining…' : 'Explain result'}
      </Button>
      {unavailable && (
        <div className="basis-full">
          <AiUnavailableBanner />
        </div>
      )}
      {analyses.length > 0 && <PastExplanationsToggle analyses={analyses} />}
    </div>
  )
}

// One test's row — its name, status badge, and (once entered) its value,
// reference range, and interpretation. Shared by the interactive dialog
// list and the print-only copy below, which show the exact same
// information but never the same actions: `actions` is only ever passed by
// the interactive list (the Release button, the AI explain panel), so the
// print copy naturally renders as a plain read-only report just by leaving
// it out, rather than needing its own near-duplicate markup.
function LabResultRow({ test, result, actions }: { test: LabTestItem; result: LabResult | undefined; actions?: ReactNode }) {
  return (
    <li className="rounded-lg border border-border bg-slate-50/60 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-900">{test.testName}</p>
        <StatusBadge status={result ? result.status : 'PENDING'} />
      </div>
      {result ? (
        <div className="mt-2 space-y-1 text-sm text-slate-700">
          <p className="tabular-nums">
            {result.resultValue}
            {result.unit ? ` ${result.unit}` : ''}
            {result.referenceRange && <span className="text-slate-600"> (ref. {result.referenceRange})</span>}
          </p>
          {result.interpretation && <StatusBadge status={result.interpretation} />}
          {result.notes && <p className="text-xs text-slate-600">{result.notes}</p>}
          {actions}
        </div>
      ) : (
        <p className="mt-1 text-xs text-slate-600">No result entered yet.</p>
      )}
    </li>
  )
}

const editLabOrderFormSchema = z.object({
  testNames: z.string().trim().min(1, 'List at least one test'),
  priority: z.enum(LAB_ORDER_PRIORITIES),
  clinicalNotes: z.string().trim().optional(),
})
type EditLabOrderForm = z.infer<typeof editLabOrderFormSchema>

// Corrects a lab order's requested tests, priority, or notes. Only reachable
// while the order is still ORDERED — updateLabOrder rejects it with 409
// LAB_ORDER_IN_PROGRESS once a lab tech has entered any result, so this
// dialog's trigger is gated the same way. `tests` fully replaces the
// existing list (see updateLabOrderSchema's own comment), so the textarea
// is pre-filled from the current test names rather than starting blank —
// same comma/newline-separated shape as the doctor's original "Request lab
// tests" form.
function EditLabOrderDialog({ order }: { order: LabOrder }) {
  const [open, setOpen] = useState(false)
  const updateLabOrder = useUpdateLabOrder()
  const defaultValues = {
    testNames: order.tests.map((t) => t.testName).join('\n'),
    priority: order.priority,
    clinicalNotes: order.clinicalNotes ?? '',
  }
  const form = useForm<EditLabOrderForm>({ resolver: zodResolver(editLabOrderFormSchema), defaultValues })

  async function onSubmit(values: EditLabOrderForm) {
    try {
      const tests = values.testNames
        .split(/[,\n]/)
        .map((t) => t.trim())
        .filter(Boolean)
        .map((testName) => ({ testName }))
      await updateLabOrder.mutateAsync({
        id: order._id,
        input: { tests, priority: values.priority, clinicalNotes: values.clinicalNotes },
      })
      toast.success('Lab order updated')
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
        if (next) form.reset(defaultValues)
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          <Pencil className="size-3.5" /> Edit order
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit lab order</DialogTitle>
          <DialogDescription>Separate multiple tests with a comma or a new line.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="testNames"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tests</FormLabel>
                  <FormControl>
                    <Textarea rows={3} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="priority"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Priority</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="ROUTINE">Routine</SelectItem>
                      <SelectItem value="URGENT">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="clinicalNotes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Clinical notes (optional)</FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? 'Saving…' : 'Save changes'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

// Removes a lab order placed in error. Same still-ORDERED restriction as
// EditLabOrderDialog, plus a confirm step since deletion can't be undone
// the way a correction can.
function DeleteLabOrderButton({ order, onDeleted }: { order: LabOrder; onDeleted: () => void }) {
  const deleteLabOrder = useDeleteLabOrder()

  async function handleConfirm() {
    try {
      await deleteLabOrder.mutateAsync(order._id)
      toast.success(`${order.labOrderNumber} deleted`)
      onDeleted()
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" size="sm" variant="outline" className="text-slate-600 hover:text-red-600">
          <Trash2 className="size-3.5" /> Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this lab order?</AlertDialogTitle>
          <AlertDialogDescription>
            {order.labOrderNumber} will be permanently removed. This can't be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} className="bg-red-600 hover:bg-red-700">
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// Clicking a lab order row opens this dialog, which shows the patient's details
// and everything entered against the order so far, all in one place. The
// "Release" button sits directly next to each ENTERED result here, rather than
// on a separate page, for the same reason the "Enter result" form was moved
// inline: it lets a lab tech do their whole job on one order (see what was
// ordered, enter results, release them) without ever leaving this dialog.
function LabOrderDetailDialog({
  orderId,
  onOpenChange,
}: {
  orderId: string | null
  onOpenChange: (open: boolean) => void
}) {
  const { data, isLoading } = useLabOrder(orderId ?? undefined)
  const releaseResult = useReleaseLabResult()
  const createInvoice = useCreateInvoice()
  const { hasPermission } = useAuth()
  const canRelease = hasPermission('labresult.release')
  const canEnter = hasPermission('labresult.create')
  const canExplain = hasPermission('ai.explainLabResult')
  const canSeePayment = hasPermission('invoice.read')
  const canBill = hasPermission('invoice.create')
  const canEditOrder = hasPermission('laborder.update')
  const canDeleteOrder = hasPermission('laborder.delete')
  const { data: invoice } = useInvoiceForLabOrder(canSeePayment ? data?.order._id : undefined)
  const { data: labOrderAnalyses } = useLabOrderResultAnalyses(canExplain ? (orderId ?? undefined) : undefined)
  const analysesByResultId = useMemo(() => {
    const map = new Map<string, AiConsultation[]>()
    for (const consultation of labOrderAnalyses ?? []) {
      if (!consultation.labResult) continue
      const list = map.get(consultation.labResult)
      if (list) list.push(consultation)
      else map.set(consultation.labResult, [consultation])
    }
    return map
  }, [labOrderAnalyses])
  // Computed once per (tests, results) pair and reused for both the visible
  // list and the hidden print copy below — matchTestsToResults doesn't need
  // to run twice on identical inputs just because only one of those two
  // renderings is ever on screen at a time.
  const matchedTests = useMemo(() => (data ? matchTestsToResults(data.order.tests, data.results) : []), [data])

  async function handleRelease(id: string, testName: string) {
    try {
      await releaseResult.mutateAsync(id)
      toast.success(`${testName} released to the patient`)
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  // Bills this order at Sana's standard per-test fee. This is the same
  // auto-filled pricing that Admin's "Create invoice" flow uses, just triggered
  // from here by whoever is actually processing the order (typically a Lab
  // Tech), right after the doctor requested it, instead of waiting for an
  // Admin to pick it up later.
  async function handleBill(order: LabOrder) {
    try {
      const invoice = await createInvoice.mutateAsync({
        labOrder: order._id,
        items: order.tests.map((t) => ({ description: t.testName, qty: 1, unitPrice: STANDARD_LAB_TEST_FEE })),
      })
      toast.success(`${invoice.invoiceNumber} created`)
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  return (
    <>
      <Dialog open={orderId !== null} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-xl">
          {isLoading || !data ? (
            <div className="space-y-3 py-4">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2">
                  <DialogTitle>
                    {data.order.patient.firstName} {data.order.patient.lastName}
                  </DialogTitle>
                  {canSeePayment && <StatusBadge status={invoice ? invoice.status : 'no invoice yet'} />}
                  {canEditOrder && data.order.status === 'ORDERED' && <EditLabOrderDialog order={data.order} />}
                  {canDeleteOrder && data.order.status === 'ORDERED' && (
                    <DeleteLabOrderButton order={data.order} onDeleted={() => onOpenChange(false)} />
                  )}
                  {canBill && !invoice && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={createInvoice.isPending}
                      onClick={() => handleBill(data.order)}
                    >
                      Bill this order
                    </Button>
                  )}
                  <Button type="button" size="sm" variant="outline" onClick={() => window.print()}>
                    <Printer className="size-4" /> Print / Save as PDF
                  </Button>
                </div>
                <DialogDescription>
                  {data.order.labOrderNumber} · Dr. {data.order.doctor.firstName} {data.order.doctor.lastName} ·{' '}
                  {data.order.priority === 'URGENT' ? 'Urgent' : 'Routine'}
                  {data.order.clinicalNotes && <> · {data.order.clinicalNotes}</>}
                </DialogDescription>
              </DialogHeader>

              <ul className="space-y-3">
                {matchedTests.map(({ test, result, index }) => {
                  const releaseButton = result && canRelease && result.status === 'ENTERED' && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={releaseResult.isPending}
                      onClick={() => handleRelease(result._id, result.testName)}
                    >
                      <Send className="size-4" /> Release
                    </Button>
                  )
                  return (
                    <LabResultRow
                      key={`${test.testName}-${index}`}
                      test={test}
                      result={result}
                      actions={
                        result &&
                        (canExplain ? (
                          <LabResultAiExplain
                            result={result}
                            labOrderId={data.order._id}
                            analyses={analysesByResultId.get(result._id) ?? []}
                            releaseButton={releaseButton}
                          />
                        ) : (
                          releaseButton && <div className="mt-3">{releaseButton}</div>
                        ))
                      }
                    />
                  )
                })}
              </ul>

              {canEnter && <EnterResultForm order={data.order} />}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* A separate print copy, portalled straight to <body> (see
          components/PrintArea.tsx) rather than printed from inside the
          Dialog — the dialog's own content lives inside a `fixed`,
          height-capped, screen-only overlay, which browsers reliably clip
          rather than paginate across when printed. */}
      {data && (
        <PrintArea>
          <h1 className="text-2xl font-bold text-slate-900">Sana</h1>
          <p className="text-sm text-slate-600">Lab Report · Printed {formatShortDate(new Date().toISOString())}</p>
          <div className="mt-4">
            <p className="text-base font-semibold text-slate-900">
              {data.order.patient.firstName} {data.order.patient.lastName}
            </p>
            <p className="text-sm text-slate-600">
              {data.order.labOrderNumber} · Dr. {data.order.doctor.firstName} {data.order.doctor.lastName} ·{' '}
              {data.order.priority === 'URGENT' ? 'Urgent' : 'Routine'}
              {data.order.clinicalNotes && <> · {data.order.clinicalNotes}</>}
            </p>
          </div>
          <ul className="mt-4 space-y-2">
            {matchedTests.map(({ test, result, index }) => (
              <LabResultRow key={`${test.testName}-${index}`} test={test} result={result} />
            ))}
          </ul>
        </PrintArea>
      )}
    </>
  )
}

export function LabOrdersPage() {
  const { hasPermission, user } = useAuth()
  const [statusFilter, setStatusFilter] = useState<LabOrderStatus | 'ALL'>('ALL')
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  // Always fetch the complete, unfiltered list. The status dropdown below filters
  // it in the browser, so the summary counts always reflect every order no matter
  // which status the table is currently narrowed down to.
  const { data: allOrders, isLoading } = useLabOrders()
  const orders = statusFilter === 'ALL' ? allOrders : allOrders?.filter((o) => o.status === statusFilter)
  // listLabOrders() only narrows the list down to a Doctor's own orders. Every
  // other role that can view lab orders (Admin, Lab Tech) sees every order, so
  // the text below is based on that same distinction rather than a separate,
  // hardcoded role check.
  const seesEveryOrder = user?.role.name !== 'DOCTOR'
  const canOpenDetail = hasPermission('labresult.create') || hasPermission('labresult.release') || hasPermission('labresult.read')

  const pendingCount = allOrders?.filter((o) => o.status === 'ORDERED').length ?? 0
  const inProgressCount = allOrders?.filter((o) => o.status === 'PROCESSING').length ?? 0
  const urgentCount =
    allOrders?.filter((o) => o.priority === 'URGENT' && o.status !== 'COMPLETED' && o.status !== 'REVIEWED').length ?? 0

  return (
    <div className="space-y-4">
      {!isLoading && allOrders && allOrders.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <StatCard icon={Clock} value={pendingCount} label="Pending orders" />
          <StatCard icon={Hourglass} value={inProgressCount} label="In progress" />
          <StatCard icon={AlertTriangle} value={urgentCount} label="Urgent, outstanding" />
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          {seesEveryOrder ? 'Every lab order in the system.' : 'Orders you placed.'}
        </p>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as LabOrderStatus | 'ALL')}>
          {/* This filter has no visible <label>, so without aria-label a
              screen reader announces it as an unnamed combobox — the
              selected value alone doesn't say what it controls. */}
          <SelectTrigger size="sm" className="w-40" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            {LAB_ORDER_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s.charAt(0) + s.slice(1).toLowerCase()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border border-border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 hover:bg-slate-50">
              <TableHead>Order</TableHead>
              <TableHead>Patient</TableHead>
              <TableHead>Tests</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 5 }).map((__, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}

            {!isLoading &&
              orders?.map((order) => (
                <TableRow
                  key={order._id}
                  tabIndex={canOpenDetail ? 0 : undefined}
                  role={canOpenDetail ? 'link' : undefined}
                  className={canOpenDetail ? 'cursor-pointer focus-visible:bg-blue-50 focus-visible:outline-none' : undefined}
                  onClick={canOpenDetail ? () => setSelectedOrderId(order._id) : undefined}
                  onKeyDown={
                    canOpenDetail
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            setSelectedOrderId(order._id)
                          }
                        }
                      : undefined
                  }
                >
                  <TableCell className="font-mono text-xs text-slate-600">{order.labOrderNumber}</TableCell>
                  <TableCell className="font-medium text-slate-900">
                    {order.patient.firstName} {order.patient.lastName}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {order.tests.map((t) => (
                        <Badge key={t.testName} variant="outline" className={statusBadgeClassName(t.status)}>
                          {t.testName}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        order.priority === 'URGENT'
                          ? 'border-red-200 bg-red-50 text-red-700'
                          : 'border-slate-200 bg-slate-100 text-slate-600'
                      }
                    >
                      {order.priority === 'URGENT' ? 'Urgent' : 'Routine'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={order.status} />
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>

        {!isLoading && orders?.length === 0 && (
          <EmptyState icon={FlaskConical} title="No lab orders" description="Orders placed during an encounter will show up here." />
        )}
      </div>

      <LabOrderDetailDialog orderId={selectedOrderId} onOpenChange={(open) => !open && setSelectedOrderId(null)} />
    </div>
  )
}
