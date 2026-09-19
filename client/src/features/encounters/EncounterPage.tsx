import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useForm, useFieldArray, type Control } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  ArrowLeft,
  Activity,
  Stethoscope,
  FlaskConical,
  HeartPulse,
  Pencil,
  Plus,
  Send,
  Sparkles,
  CheckCircle2,
  Pill,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/features/auth/useAuth'
import { useEncounter, useAddVitals, useUpdateVitals, useAddDiagnosis, useCompleteEncounter } from './api'
import type { UpdateVitalsInput } from './api'
import { useCreateLabOrder, useLabOrdersForEncounter } from '@/features/labOrders/api'
import { useAiConsultations, useAnalyzeVitals } from '@/features/ai/api'
import { useAiAction } from '@/features/ai/useAiAction'
import { SanaAiPanel } from '@/features/ai/SanaAiPanel'
import { CollapsibleConsultationGroup } from '@/features/ai/ConsultationGroup'
import { useCreateReferral, referralHasUnread } from '@/features/referrals/api'
import { ReferralMessagesDialog } from '@/features/referrals/ReferralMessagesDialog'
import { useNotifications } from '@/features/notifications/api'
import { useCreatePrescription } from '@/features/prescriptions/api'
import { useDoctors } from '@/features/users/api'
import { getApiErrorMessage } from '@/lib/api'
import { isPopulated } from '@/lib/utils'
import { formatDateTime } from '@/lib/date'
import type { VitalSign, EncounterStatus } from '@/types/encounter'
import type { Referral } from '@/types/referral'
import type { Prescription } from '@/types/prescription'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/StatusBadge'
import { AiUnavailableBanner } from '@/components/AiUnavailableBanner'
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

// Every field needs a real '' default, not left undefined — a `<Input
// {...field}>` with value={undefined} starts uncontrolled, then flips to
// controlled the moment the user types into any field, which triggers
// React's uncontrolled-to-controlled warning and can lose focus/cursor
// position mid-edit. EditVitalsDialog below seeds proper string defaults
// from real data via toFormValue for the same reason; this is that same
// all-empty shape for a brand new form.
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
  notes: z.string().trim().optional(),
})
type DiagnosisForm = z.infer<typeof diagnosisFormSchema>

const referralFormSchema = z.object({
  toDoctor: z.string().min(1, 'Select a doctor'),
  reason: z.string().trim().min(1, 'Required'),
  notes: z.string().trim().optional(),
})
type ReferralForm = z.infer<typeof referralFormSchema>

const medicationItemSchema = z.object({
  drugName: z.string().trim().min(1, 'Required'),
  dosage: z.string().trim().min(1, 'Required'),
  frequency: z.string().trim().min(1, 'Required'),
  duration: z.string().trim().min(1, 'Required'),
  instructions: z.string().trim().optional(),
})

const prescriptionFormSchema = z.object({
  medications: z.array(medicationItemSchema).min(1, 'Add at least one medication'),
})
type PrescriptionForm = z.infer<typeof prescriptionFormSchema>

const EMPTY_MEDICATION = { drugName: '', dosage: '', frequency: '', duration: '', instructions: '' }

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

// Same conversion, but an emptied field becomes `null` instead of
// `undefined` — used only for EditVitalsDialog's submit below. `undefined`
// keys are dropped entirely by JSON.stringify, so a nurse clearing a
// previously-recorded value would otherwise send a request with that key
// simply missing, which the server (see updateVitals's per-key merge)
// correctly reads as "leave the old value alone" rather than "clear it."
// `null` is what actually tells the server to unset it.
function toNumberOrNull(value: string | undefined) {
  return toNumberOrUndefined(value) ?? null
}

// The 8-field grid shared by AddVitalsForm and EditVitalsDialog below, kept
// as one component so the two forms can never drift apart in which fields
// they expose.
function VitalsFieldGrid({ control }: { control: Control<VitalsForm> }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <FormField
        control={control}
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
        control={control}
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
        control={control}
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
        control={control}
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
        control={control}
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
        control={control}
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
        control={control}
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
        control={control}
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
  )
}

// Shared by every "collapsed once something already exists, open by
// default otherwise" form on this page (AddVitalsForm, AddDiagnosisForm,
// ReferToAnotherDoctorForm, PrescribeForm below) — pulling the expand/
// collapse state itself into one hook means those four forms can't drift
// on how it behaves (e.g. one of them forgetting to collapse again after a
// successful submit).
function useCollapsibleForm(hasExisting: boolean) {
  const [expanded, setExpanded] = useState(!hasExisting)
  return { expanded, expand: () => setExpanded(true), collapse: () => setExpanded(false) }
}

// The button shown in place of a form while it's collapsed — same
// icon+label+outline shape every "add X" form on this page uses.
function CollapsedFormTrigger({
  icon: Icon,
  label,
  onClick,
  full,
}: {
  icon: LucideIcon
  label: string
  onClick: () => void
  full?: boolean
}) {
  return (
    <Button type="button" size="sm" variant="outline" className={full ? 'w-full' : undefined} onClick={onClick}>
      <Icon className="size-3.5" /> {label}
    </Button>
  )
}

// The "Cancel" button next to a form's submit button — only shown once
// something already exists to collapse back to. With nothing recorded yet,
// there's nowhere useful to collapse to, so no Cancel button is shown.
function CollapseCancelButton({ show, onClick }: { show: boolean; onClick: () => void }) {
  if (!show) return null
  return (
    <Button type="button" size="sm" variant="outline" onClick={onClick}>
      Cancel
    </Button>
  )
}

// Once a set of vitals already exists, the full 8-input grid stays
// collapsed behind a small button instead of always taking up space below
// the numbers just shown above it — a nurse recording a fresh set (nothing
// entered yet this encounter) still sees the form open by default, since
// there's nothing else useful to show in its place.
function AddVitalsForm({ encounterId, hasExistingVitals }: { encounterId: string; hasExistingVitals: boolean }) {
  const { expanded, expand, collapse } = useCollapsibleForm(hasExistingVitals)
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
      collapse()
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  if (!expanded) {
    return <CollapsedFormTrigger icon={Plus} label="Record vitals" onClick={expand} full />
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
        <VitalsFieldGrid control={form.control} />
        {form.formState.errors.temperature && (
          <p className="text-xs text-red-600">{form.formState.errors.temperature.message}</p>
        )}
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={form.formState.isSubmitting} className="flex-1">
            {form.formState.isSubmitting ? 'Saving…' : 'Record vitals'}
          </Button>
          <CollapseCancelButton show={hasExistingVitals} onClick={collapse} />
        </div>
      </form>
    </Form>
  )
}

// Converts a recorded number back into the string a form field can edit —
// undefined becomes '' rather than the literal text "undefined".
function toFormValue(value: number | undefined): string {
  return value === undefined ? '' : String(value)
}

// Lets a Nurse (holds 'vitals.update') correct the most recently recorded
// set of vitals — e.g. a mistyped value — without creating a whole new
// entry. Only ever shown for the latest vitals record, never an older one,
// since that's the only one still realistically correctable.
function EditVitalsDialog({ encounterId, vitals }: { encounterId: string; vitals: VitalSign }) {
  const [open, setOpen] = useState(false)
  const updateVitals = useUpdateVitals(encounterId)
  const form = useForm<VitalsForm>({
    resolver: zodResolver(vitalsFormSchema),
    defaultValues: {
      temperature: toFormValue(vitals.temperature),
      heartRate: toFormValue(vitals.heartRate),
      respiratoryRate: toFormValue(vitals.respiratoryRate),
      systolicBp: toFormValue(vitals.systolicBp),
      diastolicBp: toFormValue(vitals.diastolicBp),
      oxygenSaturation: toFormValue(vitals.oxygenSaturation),
      weight: toFormValue(vitals.weight),
      height: toFormValue(vitals.height),
    },
  })

  async function onSubmit(values: VitalsForm) {
    try {
      const input: UpdateVitalsInput = {
        temperature: toNumberOrNull(values.temperature),
        heartRate: toNumberOrNull(values.heartRate),
        respiratoryRate: toNumberOrNull(values.respiratoryRate),
        systolicBp: toNumberOrNull(values.systolicBp),
        diastolicBp: toNumberOrNull(values.diastolicBp),
        oxygenSaturation: toNumberOrNull(values.oxygenSaturation),
        weight: toNumberOrNull(values.weight),
        height: toNumberOrNull(values.height),
      }
      await updateVitals.mutateAsync({ vitalId: vitals._id, input })
      toast.success('Vitals updated')
      setOpen(false)
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="icon-sm" variant="ghost" aria-label="Edit vitals">
          <Pencil className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit vitals</DialogTitle>
          <DialogDescription>Corrects the most recently recorded set of vitals.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <VitalsFieldGrid control={form.control} />
            {form.formState.errors.temperature && (
              <p className="text-xs text-red-600">{form.formState.errors.temperature.message}</p>
            )}
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

// This is for nurses only, using the 'ai.analyzeVitals' permission rather
// than the 'ai.consult' permission that only doctors have. It's a shortcut
// into the same Sana AI system, using a fixed question about the vitals
// just recorded instead of a free-text diagnostic question (see
// server/src/services/ai.service.ts's analyzeVitalsForNurse). There are no
// accept/ignore review controls here — reviewing AI answers stays the
// doctor's job (see ConsultationGroup.tsx's reviewable prop). Past analyses
// are shown the same collapsible-dropdown way as the doctor's SanaAiPanel,
// via the same useAiConsultations history, filtered down to this nurse
// shortcut's own entries — so they survive a page reload instead of only
// existing in local state, and the freshest analysis expands automatically.
//
// This is its own Card, at the same level as the Vitals card rather than
// bolted onto the bottom of it, so it reads as a separate action (ask the
// AI about what was just recorded) instead of another step of recording
// vitals — the same one-card-per-concern pattern LabOrdersCard and
// SanaAiPanel already use.
function NurseAiAnalysis({ encounterId }: { encounterId: string }) {
  const { data: consultations, isLoading } = useAiConsultations(encounterId)
  const analyzeVitals = useAnalyzeVitals()
  const { unavailable, run } = useAiAction(analyzeVitals.mutateAsync)
  const [notes, setNotes] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)

  const items = (consultations ?? []).filter((c) => c.source === 'NURSE_VITALS_ANALYSIS')

  async function handleAnalyze() {
    const consultation = await run({ encounter: encounterId, notes: notes || undefined })
    // Force the dropdown open right after a fresh result comes in, so the
    // nurse sees it immediately instead of having to click to expand —
    // same collapsed-by-default behavior otherwise as the doctor's panel.
    if (consultation) setHistoryOpen(true)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4 text-blue-600" /> AI Analysis
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && <Skeleton className="h-20 w-full" />}

        {!isLoading && items.length > 0 && (
          <CollapsibleConsultationGroup
            label="AI Analysis"
            icon={HeartPulse}
            iconClassName="text-teal-700"
            items={items}
            encounterId={encounterId}
            reviewable={false}
            open={historyOpen}
            onOpenChange={setHistoryOpen}
          />
        )}

        {unavailable && <AiUnavailableBanner />}

        <Textarea
          rows={1}
          placeholder="Optional notes to include (optional)…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="min-h-9 text-xs"
        />
        <Button type="button" size="sm" variant="outline" disabled={analyzeVitals.isPending} onClick={handleAnalyze}>
          <Sparkles className="size-3.5" /> {analyzeVitals.isPending ? 'Analyzing…' : 'AI Analysis'}
        </Button>
      </CardContent>
    </Card>
  )
}

// Same reasoning as AddVitalsForm's collapse behavior above: once at least
// one diagnosis already exists, the form stays collapsed behind a small
// button instead of always sitting open under the list. With nothing
// recorded yet, it opens by default since there's nothing else to show.
function AddDiagnosisForm({ encounterId, hasExistingDiagnoses }: { encounterId: string; hasExistingDiagnoses: boolean }) {
  const { expanded, expand, collapse } = useCollapsibleForm(hasExistingDiagnoses)
  const addDiagnosis = useAddDiagnosis(encounterId)
  const form = useForm<DiagnosisForm>({
    resolver: zodResolver(diagnosisFormSchema),
    defaultValues: { diagnosis: '', notes: '' },
  })

  async function onSubmit(values: DiagnosisForm) {
    try {
      await addDiagnosis.mutateAsync(values)
      toast.success('Diagnosis added')
      form.reset({ diagnosis: '', notes: '' })
      collapse()
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  if (!expanded) {
    return <CollapsedFormTrigger icon={Plus} label="Add diagnosis" onClick={expand} />
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
        <FormField
          control={form.control}
          name="diagnosis"
          render={({ field }) => (
            <FormItem>
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
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? 'Saving…' : 'Add diagnosis'}
          </Button>
          <CollapseCancelButton show={hasExistingDiagnoses} onClick={collapse} />
        </div>
      </form>
    </Form>
  )
}

// Same collapse-once-something-exists shape as AddDiagnosisForm above.
function ReferToAnotherDoctorForm({
  encounterId,
  hasExistingReferrals,
}: {
  encounterId: string
  hasExistingReferrals: boolean
}) {
  const { expanded, expand, collapse } = useCollapsibleForm(hasExistingReferrals)
  const { user } = useAuth()
  const { data: doctors } = useDoctors()
  const createReferral = useCreateReferral(encounterId)
  const form = useForm<ReferralForm>({
    resolver: zodResolver(referralFormSchema),
    defaultValues: { toDoctor: '', reason: '', notes: '' },
  })

  async function onSubmit(values: ReferralForm) {
    try {
      await createReferral.mutateAsync(values)
      toast.success('Referral sent')
      form.reset({ toDoctor: '', reason: '', notes: '' })
      collapse()
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  if (!expanded) {
    return <CollapsedFormTrigger icon={Send} label="Refer to another doctor" onClick={expand} />
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
        <FormField
          control={form.control}
          name="toDoctor"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">Refer to</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger className="h-9 w-full">
                    <SelectValue placeholder="Select a doctor" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {doctors
                    ?.filter((doctor) => doctor.id !== user?.id)
                    .map((doctor) => (
                      <SelectItem key={doctor.id} value={doctor.id}>
                        Dr. {doctor.firstName} {doctor.lastName}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="reason"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">Reason</FormLabel>
              <FormControl>
                <Input placeholder="e.g. Cardiology opinion needed" className="h-9" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
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
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? 'Sending…' : 'Send referral'}
          </Button>
          <CollapseCancelButton show={hasExistingReferrals} onClick={collapse} />
        </div>
      </form>
    </Form>
  )
}

// Read-only — a referral's status only ever changes on the receiving
// doctor's own /referrals worklist (see ReferralsPage.tsx), never from here.
function ReferralsList({ referrals }: { referrals: Referral[] }) {
  // Same cached notification data the sidebar badge reads — narrowed
  // per-referral via referralHasUnread so an outgoing referral that just
  // got acknowledged/completed (or replied to) shows its own unread dot.
  const { data: notifications } = useNotifications()

  return (
    <ul className="space-y-3">
      {referrals.map((referral) => (
        <li key={referral._id} className="rounded-lg border border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
              {referralHasUnread(notifications, referral._id) && (
                <span className="size-1.5 shrink-0 rounded-full bg-blue-600" aria-label="Unread" />
              )}
              To {isPopulated(referral.toDoctor) ? `Dr. ${referral.toDoctor.firstName} ${referral.toDoctor.lastName}` : 'doctor'}
            </p>
            <StatusBadge status={referral.status} />
          </div>
          <p className="mt-1 text-xs text-slate-700">{referral.reason}</p>
          {referral.notes && <p className="mt-1 text-xs text-slate-600">{referral.notes}</p>}
          <div className="mt-2">
            <ReferralMessagesDialog referral={referral} />
          </div>
        </li>
      ))}
    </ul>
  )
}

// Same collapse-once-something-exists shape as AddDiagnosisForm/
// ReferToAnotherDoctorForm above. Unlike those, this form manages a
// dynamic list of medication rows via useFieldArray — a prescription
// commonly covers more than one drug at once.
function PrescribeForm({ encounterId, hasExistingPrescriptions }: { encounterId: string; hasExistingPrescriptions: boolean }) {
  const { expanded, expand, collapse } = useCollapsibleForm(hasExistingPrescriptions)
  const createPrescription = useCreatePrescription(encounterId)
  const form = useForm<PrescriptionForm>({
    resolver: zodResolver(prescriptionFormSchema),
    defaultValues: { medications: [EMPTY_MEDICATION] },
  })
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'medications' })

  async function onSubmit(values: PrescriptionForm) {
    try {
      await createPrescription.mutateAsync(values)
      toast.success('Prescription written')
      form.reset({ medications: [EMPTY_MEDICATION] })
      collapse()
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  if (!expanded) {
    return <CollapsedFormTrigger icon={Plus} label="Write prescription" onClick={expand} />
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
        {fields.map((field, index) => (
          <div key={field.id} className="space-y-2 rounded-lg border border-border p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-600 uppercase">Medication {index + 1}</p>
              {fields.length > 1 && (
                <Button type="button" size="icon-sm" variant="ghost" aria-label="Remove medication" onClick={() => remove(index)}>
                  <Trash2 className="size-3.5" />
                </Button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <FormField
                control={form.control}
                name={`medications.${index}.drugName`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Drug</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Amoxicillin" className="h-9" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={`medications.${index}.dosage`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Dosage</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. 500mg" className="h-9" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={`medications.${index}.frequency`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Frequency</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. 3x daily" className="h-9" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={`medications.${index}.duration`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Duration</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. 7 days" className="h-9" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name={`medications.${index}.instructions`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Instructions (optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Take with food" className="h-9" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
        ))}

        <Button type="button" size="sm" variant="outline" onClick={() => append(EMPTY_MEDICATION)}>
          <Plus className="size-3.5" /> Add another medication
        </Button>

        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? 'Saving…' : 'Write prescription'}
          </Button>
          <CollapseCancelButton show={hasExistingPrescriptions} onClick={collapse} />
        </div>
      </form>
    </Form>
  )
}

// Read-only — dispensing only ever happens from the Pharmacist's own
// /prescriptions queue (see PrescriptionsPage.tsx), never from here.
function PrescriptionsList({ prescriptions }: { prescriptions: Prescription[] }) {
  return (
    <ul className="space-y-3">
      {prescriptions.map((rx) => (
        <li key={rx._id} className="rounded-lg border border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="font-mono text-xs text-slate-600">{rx.prescriptionNumber}</p>
            <StatusBadge status={rx.status} />
          </div>
          <ul className="mt-1.5 space-y-1">
            {rx.medications.map((m, i) => (
              <li key={i} className="text-sm text-slate-700">
                {m.drugName} {m.dosage} · {m.frequency} · {m.duration}
                {m.instructions && <span className="text-slate-600"> — {m.instructions}</span>}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
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

// Shown to anyone with 'laborder.read' (Doctor and Admin, on this page —
// Lab Tech works the queue from its own page instead), so a newly
// requested order is visible right away instead of only living in the
// request dialog's own success toast. The "Request lab tests" trigger
// itself stays limited to 'laborder.create' and an open encounter, same as
// before.
function LabOrdersCard({ encounterId, encounterStatus }: { encounterId: string; encounterStatus: EncounterStatus }) {
  const { hasPermission } = useAuth()
  const { data: labOrders, isLoading } = useLabOrdersForEncounter(encounterId)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Lab orders</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && <Skeleton className="h-16 w-full" />}
        {!isLoading && (labOrders?.length ?? 0) === 0 && <p className="text-sm text-slate-600">No lab orders yet.</p>}
        {!isLoading && labOrders && labOrders.length > 0 && (
          <ul className="space-y-3">
            {labOrders.map(({ order }) => (
              <li key={order._id} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-mono text-xs text-slate-600">{order.labOrderNumber}</p>
                  <div className="flex items-center gap-1.5">
                    {order.priority === 'URGENT' && (
                      <Badge variant="outline" className="border-red-200 bg-red-50 text-[10px] text-red-700">
                        Urgent
                      </Badge>
                    )}
                    <StatusBadge status={order.status} />
                  </div>
                </div>
                <p className="mt-1.5 text-sm text-slate-700">{order.tests.map((t) => t.testName).join(', ')}</p>
              </li>
            ))}
          </ul>
        )}

        {hasPermission('laborder.create') && encounterStatus === 'IN_PROGRESS' && (
          <div className={labOrders && labOrders.length > 0 ? 'border-t border-border pt-4' : undefined}>
            <OrderLabTestsDialog encounterId={encounterId} />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Doctor-only ('encounter.complete', and only the doctor assigned to this
// specific encounter — see encounter.service.ts's completeEncounter). This
// is the only way an encounter ever moves from IN_PROGRESS to COMPLETED,
// which then locks out any further vitals, diagnoses, or lab orders — so
// it asks for confirmation rather than acting on a single click.
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
  const { user, hasPermission } = useAuth()
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

  const { encounter, vitals, diagnoses, referrals, prescriptions } = data
  const latestVitals = vitals.at(-1)

  return (
    <div className="space-y-5">
      <Link to="/encounters" className="flex w-fit items-center gap-1.5 text-sm text-slate-600 hover:text-blue-600">
        <ArrowLeft className="size-4" /> Back to Queue
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
              <StatusBadge status={encounter.status} />
            </div>
            <p className="mt-1 text-sm text-slate-600">
              Dr. {encounter.doctor.firstName} {encounter.doctor.lastName} · Started {formatDateTime(encounter.startedAt)}
            </p>
          </div>

          {/* Only the assigned doctor sees this — the server separately
              double-checks that this doctor is the one actually assigned
              to this encounter, so even a direct link couldn't be used to
              complete someone else's encounter. */}
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
                  <p className="text-xs font-medium text-slate-600 uppercase">History</p>
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
                <p className="text-sm text-slate-600">No diagnoses recorded yet.</p>
              ) : (
                <ul className="space-y-3">
                  {diagnoses.map((dx) => (
                    <li key={dx._id} className="rounded-lg border border-border p-3">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-slate-900">{dx.diagnosis}</p>
                        {dx.diagnosisCode && (
                          <Badge variant="outline" className="font-mono text-[10px] text-slate-600">
                            {dx.diagnosisCode}
                          </Badge>
                        )}
                      </div>
                      {dx.notes && <p className="mt-1 text-xs text-slate-600">{dx.notes}</p>}
                    </li>
                  ))}
                </ul>
              )}

              {hasPermission('diagnosis.create') && encounter.status === 'IN_PROGRESS' && (
                <div className="border-t border-border pt-4">
                  <AddDiagnosisForm encounterId={encounter._id} hasExistingDiagnoses={diagnoses.length > 0} />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Referring is restricted to the assigned doctor client-side too
              (unlike AddDiagnosisForm above), since only they can actually
              succeed at it — see referral.service.ts's ownership check —
              and a doctor who opened someone else's encounter to review a
              referral sent to them has no reason to see a form that would
              only 404. */}
          {(hasPermission('referral.create') || referrals.length > 0) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Referrals</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {referrals.length === 0 ? (
                  <p className="text-sm text-slate-600">No referrals on this encounter.</p>
                ) : (
                  <ReferralsList referrals={referrals} />
                )}

                {hasPermission('referral.create') &&
                  encounter.status === 'IN_PROGRESS' &&
                  user?.id === encounter.doctor._id && (
                    <div className="border-t border-border pt-4">
                      <ReferToAnotherDoctorForm encounterId={encounter._id} hasExistingReferrals={referrals.length > 0} />
                    </div>
                  )}
              </CardContent>
            </Card>
          )}

          {/* Same client-side ownership gating as the Referrals card above —
              only the assigned doctor gets the write form, but anyone who
              can open the encounter sees what's already been prescribed. */}
          {(hasPermission('prescription.create') || prescriptions.length > 0) && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Pill className="size-4 text-blue-600" /> Prescriptions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {prescriptions.length === 0 ? (
                  <p className="text-sm text-slate-600">No prescriptions on this encounter.</p>
                ) : (
                  <PrescriptionsList prescriptions={prescriptions} />
                )}

                {hasPermission('prescription.create') &&
                  encounter.status === 'IN_PROGRESS' &&
                  user?.id === encounter.doctor._id && (
                    <div className="border-t border-border pt-4">
                      <PrescribeForm encounterId={encounter._id} hasExistingPrescriptions={prescriptions.length > 0} />
                    </div>
                  )}
              </CardContent>
            </Card>
          )}

          {hasPermission('laborder.read') && <LabOrdersCard encounterId={encounter._id} encounterStatus={encounter.status} />}
        </div>

        {/* ---------- Right column: vitals and AI, grouped separately from
             the clinical record on the left since they're read/act-on-data
             rather than record-keeping. ---------- */}
        <div className="space-y-5">
          <Card>
            <CardHeader className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="size-4 text-blue-600" /> Vitals
              </CardTitle>
              {latestVitals && hasPermission('vitals.update') && encounter.status === 'IN_PROGRESS' && (
                <EditVitalsDialog encounterId={encounter._id} vitals={latestVitals} />
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {latestVitals ? (
                <div className="grid grid-cols-4 gap-3">
                  {VITALS_FIELDS.map(({ key, label, unit }) => {
                    const value = latestVitals[key]
                    return (
                      <div key={key}>
                        <p className="text-[10px] font-medium text-slate-600 uppercase">{label}</p>
                        <p className="tabular-nums text-sm font-semibold text-slate-900">
                          {typeof value === 'number' ? `${value}${unit}` : '—'}
                        </p>
                      </div>
                    )
                  })}
                  {(latestVitals.systolicBp !== undefined || latestVitals.diastolicBp !== undefined) && (
                    <div>
                      <p className="text-[10px] font-medium text-slate-600 uppercase">BP</p>
                      <p className="tabular-nums text-sm font-semibold text-slate-900">
                        {latestVitals.systolicBp ?? '—'}/{latestVitals.diastolicBp ?? '—'}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-slate-600">No vitals recorded yet.</p>
              )}

              {hasPermission('vitals.create') && encounter.status === 'IN_PROGRESS' && (
                <div className="border-t border-border pt-4">
                  <AddVitalsForm encounterId={encounter._id} hasExistingVitals={Boolean(latestVitals)} />
                </div>
              )}
            </CardContent>
          </Card>

          {latestVitals && hasPermission('ai.analyzeVitals') && encounter.status === 'IN_PROGRESS' && (
            <NurseAiAnalysis encounterId={encounter._id} />
          )}

          {hasPermission('ai.consult') && encounter.status === 'IN_PROGRESS' && <SanaAiPanel encounterId={encounter._id} />}
        </div>
      </div>
    </div>
  )
}
