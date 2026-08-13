import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CalendarDays, Plus, Clock, Stethoscope, ArrowUpRight } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/features/auth/useAuth'
import { useAppointments, useCreateAppointment, useUpdateAppointmentStatus, type AppointmentInput } from './api'
import { useDepartments } from '@/features/departments/api'
import { useCreateEncounter } from '@/features/encounters/api'
import { APPOINTMENT_STATUSES, type Appointment, type AppointmentStatus } from '@/types/appointment'
import { getApiErrorMessage } from '@/lib/api'
import { isPopulated } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { PatientCombobox } from '@/components/PatientCombobox'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/EmptyState'
import { StatusBadge } from '@/components/StatusBadge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'

// Mirrors server/src/schemas/appointment.ts's createAppointmentSchema,
// including the startTime < endTime check so a doomed request never
// leaves the browser. No `doctor` field — only Doctor holds
// 'appointment.create' now, and always books for themselves (the backend
// derives the owning doctor from the caller's own id — see
// appointment.service.ts's createAppointment).
const appointmentFormSchema = z
  .object({
    patient: z.string().min(1, 'Select a patient'),
    department: z.string().min(1, 'Select a department'),
    date: z.string().min(1, 'Required'),
    startTime: z.string().min(1, 'Required'),
    endTime: z.string().min(1, 'Required'),
    reason: z.string().trim().optional(),
  })
  .refine((data) => data.startTime < data.endTime, { message: 'Must be after start time', path: ['endTime'] })
type AppointmentForm = z.infer<typeof appointmentFormSchema>

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

function BookAppointmentDialog() {
  const [open, setOpen] = useState(false)
  const createAppointment = useCreateAppointment()
  const { data: departments } = useDepartments(false)

  const form = useForm<AppointmentForm>({
    resolver: zodResolver(appointmentFormSchema),
    defaultValues: { patient: '', department: '', date: '', startTime: '', endTime: '', reason: '' },
  })

  async function onSubmit(values: AppointmentForm) {
    try {
      const appointment = await createAppointment.mutateAsync(values as AppointmentInput)
      toast.success(`${appointment.appointmentNumber} booked`)
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
        if (next) form.reset()
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> Book appointment
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Book an appointment</DialogTitle>
          <DialogDescription>Books the appointment on your own schedule — checks for a conflicting slot automatically.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="patient"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Patient</FormLabel>
                  <FormControl>
                    <PatientCombobox value={field.value} onChange={(id) => field.onChange(id)} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-x-4 gap-y-4">
              <FormField
                control={form.control}
                name="department"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Department</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select a department" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {departments?.map((dept) => (
                          <SelectItem key={dept._id} value={dept._id}>
                            {dept.name}
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
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date</FormLabel>
                    <FormControl>
                      <Input type="date" min={new Date().toISOString().slice(0, 10)} className="h-10" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-2">
                <FormField
                  control={form.control}
                  name="startTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Start</FormLabel>
                      <FormControl>
                        <Input type="time" className="h-10" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="endTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>End</FormLabel>
                      <FormControl>
                        <Input type="time" className="h-10" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason (optional)</FormLabel>
                  <FormControl>
                    <Textarea rows={2} placeholder="Reason for the visit" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? 'Booking…' : 'Book appointment'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

// The status-change control shown per row to callers who hold
// 'appointment.update' (Admin/Nurse for any row, Doctor for their own only
// — see appointment.service.ts's updateAppointmentStatus, which restricts
// solely the DOCTOR case; the backend re-enforces the same scoping
// regardless of what this renders).
function StatusSelect({ appointment }: { appointment: Appointment }) {
  const updateStatus = useUpdateAppointmentStatus()

  async function handleChange(status: string) {
    try {
      await updateStatus.mutateAsync({ id: appointment._id, status: status as AppointmentStatus })
      toast.success(`${appointment.appointmentNumber} marked ${status.toLowerCase().replace('_', ' ')}`)
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  return (
    <Select value={appointment.status} onValueChange={handleChange}>
      <SelectTrigger size="sm" className="w-auto border-none bg-transparent p-0 shadow-none [&_svg]:text-slate-400">
        <StatusBadge status={appointment.status} />
      </SelectTrigger>
      <SelectContent>
        {APPOINTMENT_STATUSES.map((status) => (
          <SelectItem key={status} value={status}>
            <StatusBadge status={status} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

const encounterFormSchema = z.object({
  chiefComplaint: z.string().trim().min(1, 'Required'),
  history: z.string().trim().optional(),
})
type EncounterForm = z.infer<typeof encounterFormSchema>

// Statuses where opening a clinical encounter still makes sense — a
// cancelled/no-show/already-completed visit has nothing left to record
// against it. The backend itself places no such restriction (createEncounter
// doesn't check appointment status at all), so this is a UI-only guard
// against an action that would technically succeed but never makes sense.
const ENCOUNTER_ELIGIBLE_STATUSES: AppointmentStatus[] = ['BOOKED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS']

// Nurse only (holds 'encounter.create' — see Sana_Workflow_Prompt.md's
// mandatory-vitals-before-doctor flow): opens a new Encounter tied to this
// appointment and jumps straight into the clinical workspace. Only ever
// rendered for a row with no encounter yet (see the "Open encounter" link
// that replaces it once appt.encounter is set — the reverse link is exactly
// what makes the Nurse-opens/Doctor-continues hand-off discoverable without
// an out-of-band URL share).
function StartEncounterDialog({ appointment }: { appointment: Appointment }) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const createEncounter = useCreateEncounter()
  const form = useForm<EncounterForm>({
    resolver: zodResolver(encounterFormSchema),
    defaultValues: { chiefComplaint: '', history: '' },
  })

  if (!isPopulated(appointment.patient) || !isPopulated(appointment.department)) return null

  async function onSubmit(values: EncounterForm) {
    if (!isPopulated(appointment.patient) || !isPopulated(appointment.department)) return
    try {
      const encounter = await createEncounter.mutateAsync({
        patient: appointment.patient._id,
        department: appointment.department._id,
        appointment: appointment._id,
        ...values,
      })
      setOpen(false)
      navigate(`/encounters/${encounter._id}`)
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) form.reset({ chiefComplaint: '', history: '' })
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Stethoscope className="size-4" /> Start encounter
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start an encounter</DialogTitle>
          <DialogDescription>
            Opens the clinical workspace for {appointment.patient.firstName} {appointment.patient.lastName}.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="chiefComplaint"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Chief complaint</FormLabel>
                  <FormControl>
                    <Input placeholder="What brought them in today" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="history"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>History (optional)</FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? 'Starting…' : 'Start encounter'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

export function AppointmentsPage() {
  const { hasPermission, user } = useAuth()
  const { data: appointments, isLoading } = useAppointments()
  const canCreate = hasPermission('appointment.create')
  const canUpdate = hasPermission('appointment.update')
  const canStartEncounter = hasPermission('encounter.create')
  // Whether this role's list is the whole system or scoped to "their own"
  // is independent of who can BOOK one — Admin and Nurse both see every
  // appointment (per listAppointments' ADMIN/NURSE fallthrough branch)
  // despite neither holding 'appointment.create' anymore; Doctor sees only
  // their own despite being the one role that CAN create. Driving this
  // copy off `canCreate` (as it used to, back when only Admin could both
  // book and see everything) would now say "Every appointment" to a
  // doctor who only ever sees their own.
  const seesEveryAppointment = user?.role.name === 'ADMIN' || user?.role.name === 'NURSE'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {seesEveryAppointment ? 'Every appointment in the system.' : 'Appointments involving you.'}
        </p>
        {canCreate && <BookAppointmentDialog />}
      </div>

      <div className="rounded-lg border border-border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 hover:bg-slate-50">
              <TableHead className="text-xs font-medium tracking-wider text-slate-500 uppercase">Patient</TableHead>
              <TableHead className="text-xs font-medium tracking-wider text-slate-500 uppercase">Doctor</TableHead>
              <TableHead className="text-xs font-medium tracking-wider text-slate-500 uppercase">Department</TableHead>
              <TableHead className="text-xs font-medium tracking-wider text-slate-500 uppercase">
                <span className="flex items-center gap-1">
                  <CalendarDays className="size-3" /> Date
                </span>
              </TableHead>
              <TableHead className="text-xs font-medium tracking-wider text-slate-500 uppercase">
                <span className="flex items-center gap-1">
                  <Clock className="size-3" /> Time
                </span>
              </TableHead>
              <TableHead className="text-xs font-medium tracking-wider text-slate-500 uppercase">Status</TableHead>
              {canStartEncounter && (
                <TableHead className="text-right text-xs font-medium tracking-wider text-slate-500 uppercase">
                  Actions
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: canStartEncounter ? 7 : 6 }).map((__, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}

            {!isLoading &&
              appointments?.map((appt) => (
                <TableRow key={appt._id}>
                  <TableCell className="font-medium text-slate-900">
                    {isPopulated(appt.patient) ? `${appt.patient.firstName} ${appt.patient.lastName}` : 'You'}
                  </TableCell>
                  <TableCell className="text-slate-700">
                    {isPopulated(appt.doctor) ? `Dr. ${appt.doctor.firstName} ${appt.doctor.lastName}` : 'You'}
                  </TableCell>
                  <TableCell className="text-slate-700">
                    {isPopulated(appt.department) ? appt.department.name : '—'}
                  </TableCell>
                  <TableCell className="text-slate-700">{formatDate(appt.date)}</TableCell>
                  <TableCell className="tabular-nums text-slate-700">
                    {appt.startTime}–{appt.endTime}
                  </TableCell>
                  <TableCell>{canUpdate ? <StatusSelect appointment={appt} /> : <StatusBadge status={appt.status} />}</TableCell>
                  {canStartEncounter && (
                    <TableCell className="text-right">
                      {appt.encounter ? (
                        // An encounter already exists for this appointment
                        // (opened by the Nurse — see Appointment.encounter's
                        // reverse-link comment on models/Appointment.ts) —
                        // link straight to it instead of offering to start
                        // a second one.
                        <Button asChild size="sm" variant="ghost">
                          <Link to={`/encounters/${appt.encounter}`}>
                            Open encounter <ArrowUpRight className="size-4" />
                          </Link>
                        </Button>
                      ) : (
                        ENCOUNTER_ELIGIBLE_STATUSES.includes(appt.status) && <StartEncounterDialog appointment={appt} />
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
          </TableBody>
        </Table>

        {!isLoading && appointments?.length === 0 && (
          <EmptyState
            icon={CalendarDays}
            title="No appointments yet"
            description={canCreate ? 'Book the first appointment to get started.' : 'Nothing scheduled yet.'}
          />
        )}
      </div>
    </div>
  )
}
