import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { FlaskConical, PlusCircle } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/features/auth/useAuth'
import { useLabOrders } from './api'
import { useCreateLabResult } from '@/features/labResults/api'
import { LAB_ORDER_STATUSES, type LabOrder, type LabOrderStatus } from '@/types/labOrder'
import { LAB_RESULT_INTERPRETATIONS } from '@/types/labResult'
import { getApiErrorMessage } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/StatusBadge'
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

const resultFormSchema = z.object({
  testName: z.string().min(1, 'Select a test'),
  resultValue: z.string().trim().min(1, 'Required'),
  unit: z.string().trim().optional(),
  referenceRange: z.string().trim().optional(),
  interpretation: z.enum(LAB_RESULT_INTERPRETATIONS).optional(),
  notes: z.string().trim().optional(),
})
type ResultForm = z.infer<typeof resultFormSchema>

// Admin-only: enters a result for one still-PENDING test on this order.
// Only ever rendered when the order has at least one PENDING test left
// (see the call site) — a fully COMPLETED order has nothing left to enter.
function EnterResultDialog({ order }: { order: LabOrder }) {
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

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) {
          form.reset({
            testName: pendingTests[0]?.testName ?? '',
            resultValue: '',
            unit: '',
            referenceRange: '',
            notes: '',
          })
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <PlusCircle className="size-4" /> Enter result
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enter a lab result</DialogTitle>
          <DialogDescription>
            {order.labOrderNumber} · {order.patient.firstName} {order.patient.lastName}
          </DialogDescription>
        </DialogHeader>
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
            <div className="grid grid-cols-2 gap-x-4 gap-y-4">
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
            </div>
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
            <DialogFooter>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? 'Saving…' : 'Save result'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

export function LabOrdersPage() {
  const { hasPermission, user } = useAuth()
  const [statusFilter, setStatusFilter] = useState<LabOrderStatus | 'ALL'>('ALL')
  const { data: orders, isLoading } = useLabOrders(statusFilter === 'ALL' ? undefined : statusFilter)
  const canEnterResults = hasPermission('labresult.create')
  // listLabOrders() only scopes the list down for DOCTOR (their own orders)
  // — every other role holding 'laborder.read' (Admin, Lab Tech) sees
  // every order, so the copy below is driven by that same distinction
  // rather than a hardcoded role check.
  const seesEveryOrder = user?.role.name !== 'DOCTOR'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          {seesEveryOrder ? 'Every lab order in the system.' : 'Orders you placed.'}
        </p>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as LabOrderStatus | 'ALL')}>
          <SelectTrigger size="sm" className="w-40">
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
              <TableHead className="text-xs font-medium tracking-wider text-slate-500 uppercase">Order</TableHead>
              <TableHead className="text-xs font-medium tracking-wider text-slate-500 uppercase">Patient</TableHead>
              <TableHead className="text-xs font-medium tracking-wider text-slate-500 uppercase">Tests</TableHead>
              <TableHead className="text-xs font-medium tracking-wider text-slate-500 uppercase">Priority</TableHead>
              <TableHead className="text-xs font-medium tracking-wider text-slate-500 uppercase">Status</TableHead>
              {canEnterResults && (
                <TableHead className="text-right text-xs font-medium tracking-wider text-slate-500 uppercase">
                  Actions
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: canEnterResults ? 6 : 5 }).map((__, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}

            {!isLoading &&
              orders?.map((order) => {
                const hasPending = order.tests.some((t) => t.status === 'PENDING')
                return (
                  <TableRow key={order._id}>
                    <TableCell className="font-mono text-xs text-slate-500">{order.labOrderNumber}</TableCell>
                    <TableCell className="font-medium text-slate-900">
                      {order.patient.firstName} {order.patient.lastName}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {order.tests.map((t) => (
                          <Badge
                            key={t.testName}
                            variant="outline"
                            className={
                              t.status === 'COMPLETED'
                                ? 'border-green-200 bg-green-50 text-green-700'
                                : 'border-amber-200 bg-amber-50 text-amber-700'
                            }
                          >
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
                    {canEnterResults && (
                      <TableCell className="text-right">
                        {hasPending && <EnterResultDialog order={order} />}
                      </TableCell>
                    )}
                  </TableRow>
                )
              })}
          </TableBody>
        </Table>

        {!isLoading && orders?.length === 0 && (
          <EmptyState icon={FlaskConical} title="No lab orders" description="Orders placed during an encounter will show up here." />
        )}
      </div>
    </div>
  )
}
