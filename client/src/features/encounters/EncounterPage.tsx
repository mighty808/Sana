import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowLeft, Activity, Stethoscope, FlaskConical, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/features/auth/useAuth'
import { useEncounter, useAddVitals, useAddDiagnosis, useCompleteEncounter } from './api'
import { useCreateLabOrder } from '@/features/labOrders/api'
import { MediAssistPanel } from '@/features/ai/MediAssistPanel'
import type { VitalSign } from '@/types/encounter'
import { getApiErrorMessage } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
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

// Every field is optional individually (a nurse might not have every
// instrument on hand), but the backend rejects a request with none of them
// set at all — mirrored here with the same .refine() check as
// server/src/schemas/encounter.ts's addVitalsSchema.
const vitalsFormSchema = z
  .object({
    temperature: z.string().optional(),
    heartRate: z.string().optional(),
    respiratoryRate: z.string().optional(),
    systolicBp: z.string().optional(),
    diastolicBp: z.string().optional(),
    oxygenSaturation: z.string().optional(),
    weight: z.string().optional(),
    height: z.string().optional(),
  })
  .refine((data) => Object.values(data).some((v) => v && v.trim() !== ''), {
    message: 'Record at least one measurement',
    path: ['temperature'],
  })
type VitalsForm = z.infer<typeof vitalsFormSchema>

// Every field defaults to '', never undefined — an <Input> that starts
// controlled (a string, even empty) and stays controlled. Leaving any of
// these as undefined would make the input start life uncontrolled and flip
// to controlled the moment the user types, which React warns about.
const EMPTY_VITALS_FORM: VitalsForm = {
  temperature: '',
  heartRate: '',
  respiratoryRate: '',
  systolicBp: '',
  diastolicBp: '',
  oxygenSaturation: '',
  weight: '',
  height: '',
}

const diagnosisFormSchema = z.object({
  diagnosis: z.string().trim().min(1, 'Required'),
  diagnosisCode: z.string().trim().optional(),
  notes: z.string().trim().optional(),
})
type DiagnosisForm = z.infer<typeof diagnosisFormSchema>

const labOrderFormSchema = z.object({
  testNames: z.string().trim().min(1, 'List at least one test'),
  priority: z.enum(['ROUTINE', 'URGENT']),
  clinicalNotes: z.string().trim().optional(),
})
type LabOrderForm = z.infer<typeof labOrderFormSchema>

// Converts a string form field back into the number-or-undefined shape the
// backend expects — an empty string means "not measured," not zero.
function toNumberOrUndefined(value: string | undefined) {
  if (!value || value.trim() === '') return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

function AddVitalsForm({ encounterId }: { encounterId: string }) {
  const addVitals = useAddVitals(encounterId)
  const form = useForm<VitalsForm>({ resolver: zodResolver(vitalsFormSchema), defaultValues: EMPTY_VITALS_FORM })

  async function onSubmit(values: VitalsForm) {
    try {
      await addVitals.mutateAsync({
        temperature: toNumberOrUndefined(values.temperature),
        heartRate: toNumberOrUndefined(values.heartRate),
        respiratoryRate: toNumberOrUndefined(values.respiratoryRate),
        systolicBp: toNumberOrUndefined(values.systolicBp),
        diastolicBp: toNumberOrUndefined(values.diastolicBp),
        oxygenSaturation: toNumberOrUndefined(values.oxygenSaturation),
        weight: toNumberOrUndefined(values.weight),
        height: toNumberOrUndefined(values.height),
      })
      toast.success('Vitals recorded')
      form.reset(EMPTY_VITALS_FORM)
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <FormField
            control={form.control}
            name="temperature"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">Temp (°C)</FormLabel>
                <FormControl>
                  <Input type="number" step="0.1" className="h-9" {...field} />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="heartRate"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">Heart rate (bpm)</FormLabel>
                <FormControl>
                  <Input type="number" className="h-9" {...field} />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="respiratoryRate"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">Resp. rate (br/min)</FormLabel>
                <FormControl>
                  <Input type="number" className="h-9" {...field} />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="oxygenSaturation"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">SpO2 (%)</FormLabel>
                <FormControl>
                  <Input type="number" className="h-9" {...field} />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="systolicBp"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">Systolic BP</FormLabel>
                <FormControl>
                  <Input type="number" className="h-9" {...field} />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="diastolicBp"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">Diastolic BP</FormLabel>
                <FormControl>
                  <Input type="number" className="h-9" {...field} />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="weight"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">Weight (kg)</FormLabel>
                <FormControl>
                  <Input type="number" step="0.1" className="h-9" {...field} />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="height"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">Height (cm)</FormLabel>
                <FormControl>
                  <Input type="number" step="0.1" className="h-9" {...field} />
                </FormControl>
              </FormItem>
            )}
          />
        </div>
        {form.formState.errors.temperature && (
          <p className="text-xs text-red-600">{form.formState.errors.temperature.message}</p>
        )}
        <Button type="submit" size="sm" disabled={form.formState.isSubmitting} className="w-full">
          {form.formState.isSubmitting ? 'Saving…' : 'Record vitals'}
        </Button>
      </form>
    </Form>
  )
}

function AddDiagnosisForm({ encounterId }: { encounterId: string }) {
  const addDiagnosis = useAddDiagnosis(encounterId)
  const form = useForm<DiagnosisForm>({
    resolver: zodResolver(diagnosisFormSchema),
    defaultValues: { diagnosis: '', diagnosisCode: '', notes: '' },
  })

  async function onSubmit(values: DiagnosisForm) {
    try {
      await addDiagnosis.mutateAsync(values)
      toast.success('Diagnosis added')
      form.reset({ diagnosis: '', diagnosisCode: '', notes: '' })
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <FormField
            control={form.control}
            name="diagnosis"
            render={({ field }) => (
              <FormItem className="col-span-2">
                <FormLabel className="text-xs">Diagnosis</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. Pulmonary tuberculosis" className="h-9" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="diagnosisCode"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">Code (optional)</FormLabel>
                <FormControl>
                  <Input placeholder="ICD-10" className="h-9" {...field} />
                </FormControl>
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">Notes (optional)</FormLabel>
              <FormControl>
                <Textarea rows={2} {...field} />
              </FormControl>
            </FormItem>
          )}
        />
        <Button type="submit" size="sm" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Saving…' : 'Add diagnosis'}
        </Button>
      </form>
    </Form>
  )
}

function OrderLabTestsDialog({ encounterId }: { encounterId: string }) {
  const [open, setOpen] = useState(false)
  const createLabOrder = useCreateLabOrder()
  const form = useForm<LabOrderForm>({
    resolver: zodResolver(labOrderFormSchema),
    defaultValues: { testNames: '', priority: 'ROUTINE', clinicalNotes: '' },
  })

  async function onSubmit(values: LabOrderForm) {
    try {
      // One test per line/comma — kept as free text since there's no fixed
      // catalog of test names on the backend (createLabOrderSchema just
      // wants a non-empty testName string per entry).
      const tests = values.testNames
        .split(/[,\n]/)
        .map((t) => t.trim())
        .filter(Boolean)
        .map((testName) => ({ testName }))

      const order = await createLabOrder.mutateAsync({
        encounter: encounterId,
        tests,
        priority: values.priority,
        clinicalNotes: values.clinicalNotes || undefined,
      })
      toast.success(`${order.labOrderNumber} requested`)
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
        if (next) form.reset({ testNames: '', priority: 'ROUTINE', clinicalNotes: '' })
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="w-full">
          <FlaskConical className="size-4" /> Request lab tests
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request lab tests</DialogTitle>
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
                    <Textarea rows={3} placeholder={'Sputum smear\nChest X-ray'} {...field} />
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
                {form.formState.isSubmitting ? 'Requesting…' : 'Request tests'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

// Doctor-only, and only the doctor assigned to this encounter (the backend
// scopes completeEncounter to `{ _id, doctor: doctorId }` — see
// encounter.service.ts). Confirmed via AlertDialog rather than a plain
// button because completing is one-way: vitals/diagnoses/lab orders can no
// longer be added afterward (each of those endpoints rejects with 409
// ENCOUNTER_COMPLETED once this fires).
function CompleteEncounterAction({ encounterId }: { encounterId: string }) {
  const completeEncounter = useCompleteEncounter(encounterId)

  async function handleConfirm() {
    try {
      await completeEncounter.mutateAsync()
      toast.success('Encounter completed')
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="outline" className="border-green-200 text-green-700 hover:bg-green-50">
          <CheckCircle2 className="size-4" /> Complete encounter
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Complete this encounter?</AlertDialogTitle>
          <AlertDialogDescription>
            Once completed, no more vitals, diagnoses, or lab orders can be added to it. This can't be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm}>Complete encounter</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

const VITALS_FIELDS: Array<{ key: keyof VitalSign; label: string; unit: string }> = [
  { key: 'temperature', label: 'Temp', unit: '°C' },
  { key: 'heartRate', label: 'HR', unit: 'bpm' },
  { key: 'respiratoryRate', label: 'RR', unit: 'br/min' },
  { key: 'oxygenSaturation', label: 'SpO2', unit: '%' },
  { key: 'weight', label: 'Weight', unit: 'kg' },
  { key: 'height', label: 'Height', unit: 'cm' },
]

export function EncounterPage() {
  const { id } = useParams<{ id: string }>()
  const { hasPermission, user } = useAuth()
  const { data, isLoading } = useEncounter(id)

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-32 w-full rounded-lg" />
      </div>
    )
  }

  if (!data) {
    return <EmptyState icon={Stethoscope} title="Encounter not found" description="This record may have been removed." />
  }

  const { encounter, vitals, diagnoses } = data
  const latestVitals = vitals.at(-1)

  return (
    <div className="space-y-5">
      <Link to="/appointments" className="flex w-fit items-center gap-1.5 text-sm text-slate-500 hover:text-blue-600">
        <ArrowLeft className="size-4" /> Back to Appointments
      </Link>

      {/* ---------- Encounter header ---------- */}
      <Card>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold text-slate-900">
                {encounter.patient.firstName} {encounter.patient.lastName}
              </h2>
              <Badge variant="outline" className="border-blue-200 bg-blue-50 font-mono text-xs text-blue-700">
                {encounter.patient.patientNumber}
              </Badge>
              <Badge
                variant="outline"
                className={
                  encounter.status === 'IN_PROGRESS'
                    ? 'border-purple-200 bg-purple-50 text-purple-700'
                    : 'border-green-200 bg-green-50 text-green-700'
                }
              >
                {encounter.status === 'IN_PROGRESS' ? 'In progress' : 'Completed'}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Dr. {encounter.doctor.firstName} {encounter.doctor.lastName} · {encounter.department.name} · Started{' '}
              {new Date(encounter.startedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
              {encounter.completedAt && (
                <>
                  {' '}
                  · Completed{' '}
                  {new Date(encounter.completedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                </>
              )}
            </p>
          </div>
          {/* Only the assigned doctor sees this — hasPermission('encounter.complete')
              is Doctor-only, and the backend independently re-checks that
              THIS doctor is the one assigned to THIS encounter, so a
              different doctor viewing it (they'd only ever get here via a
              direct link) can't complete someone else's encounter even if
              this check were somehow bypassed. */}
          {hasPermission('encounter.complete') &&
            encounter.status === 'IN_PROGRESS' &&
            user?.id === encounter.doctor._id && <CompleteEncounterAction encounterId={encounter._id} />}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.4fr_1fr]">
        {/* ---------- Left column: complaint, history, diagnoses ---------- */}
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Chief complaint</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-700">
              <p>{encounter.chiefComplaint}</p>
              {encounter.history && (
                <div>
                  <p className="text-xs font-medium text-slate-400 uppercase">History</p>
                  <p className="mt-1">{encounter.history}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Diagnoses</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {diagnoses.length === 0 ? (
                <p className="text-sm text-slate-500">No diagnoses recorded yet.</p>
              ) : (
                <ul className="space-y-3">
                  {diagnoses.map((dx) => (
                    <li key={dx._id} className="rounded-lg border border-border p-3">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-slate-900">{dx.diagnosis}</p>
                        {dx.diagnosisCode && (
                          <Badge variant="outline" className="font-mono text-[10px] text-slate-500">
                            {dx.diagnosisCode}
                          </Badge>
                        )}
                      </div>
                      {dx.notes && <p className="mt-1 text-xs text-slate-500">{dx.notes}</p>}
                    </li>
                  ))}
                </ul>
              )}

              {hasPermission('diagnosis.create') && encounter.status === 'IN_PROGRESS' && (
                <div className="border-t border-border pt-4">
                  <AddDiagnosisForm encounterId={encounter._id} />
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ---------- Right column: vitals, lab orders ---------- */}
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="size-4 text-blue-600" /> Vitals
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {latestVitals ? (
                <div className="grid grid-cols-3 gap-3">
                  {VITALS_FIELDS.map(({ key, label, unit }) => {
                    const value = latestVitals[key]
                    return (
                      <div key={key}>
                        <p className="text-[10px] font-medium text-slate-400 uppercase">{label}</p>
                        <p className="tabular-nums text-sm font-semibold text-slate-900">
                          {typeof value === 'number' ? `${value}${unit}` : '—'}
                        </p>
                      </div>
                    )
                  })}
                  {(latestVitals.systolicBp || latestVitals.diastolicBp) && (
                    <div>
                      <p className="text-[10px] font-medium text-slate-400 uppercase">BP</p>
                      <p className="tabular-nums text-sm font-semibold text-slate-900">
                        {latestVitals.systolicBp ?? '—'}/{latestVitals.diastolicBp ?? '—'}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-slate-500">No vitals recorded yet.</p>
              )}

              {hasPermission('vitals.create') && encounter.status === 'IN_PROGRESS' && (
                <div className="border-t border-border pt-4">
                  <AddVitalsForm encounterId={encounter._id} />
                </div>
              )}
            </CardContent>
          </Card>

          {hasPermission('laborder.create') && encounter.status === 'IN_PROGRESS' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Lab orders</CardTitle>
              </CardHeader>
              <CardContent>
                <OrderLabTestsDialog encounterId={encounter._id} />
              </CardContent>
            </Card>
          )}

          {hasPermission('ai.consult') && encounter.status === 'IN_PROGRESS' && (
            <MediAssistPanel encounterId={encounter._id} />
          )}
        </div>
      </div>
    </div>
  )
}
