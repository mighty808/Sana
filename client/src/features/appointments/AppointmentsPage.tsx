import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CalendarDays, LayoutList, Plus, Clock, Stethoscope, ArrowUpRight } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/features/auth/useAuth'
import { useAppointments, useCreateAppointment, useUpdateAppointmentStatus, type AppointmentInput } from './api'
import { useDoctors } from '@/features/users/api'
import { useCreateEncounter } from '@/features/encounters/api'
import { AppointmentCalendar } from './AppointmentCalendar'
import { APPOINTMENT_STATUSES, type Appointment, type AppointmentStatus } from '@/types/appointment'
import { getApiErrorMessage } from '@/lib/api'
import { isPopulated } from '@/lib/utils'
import { formatShortDate, formatLongDate, toDateKey, toDateKeyUTC } from '@/lib/date'
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

// Matches server/src/schemas/appointment.ts's createAppointmentSchema,
// including the check that start time is before end time, so a request that
// would fail never even leaves the browser. `doctor` is a field here
// because only a nurse holds the 'appointment.create' permission now, and
// she has no doctor identity of her own for the system to assume (the
// server independently checks that the chosen doctor is real and active —
// see appointment.service.ts's createAppointment).
const appointmentFormSchema = z
  .object({
    patient: z.string().min(1, 'Select a patient'),
    doctor: z.string().min(1, 'Select a doctor'),
    date: z.string().min(1, 'Required'),
    startTime: z.string().min(1, 'Required'),
    endTime: z.string().min(1, 'Required'),
    reason: z.string().trim().optional(),
  })
  .refine((data) => data.startTime < data.endTime, { message: 'Must be after start time', path: ['endTime'] })
type AppointmentForm = z.infer<typeof appointmentFormSchema>

// `initialDate` pre-fills the date field — used when this is opened from a
// calendar day cell (see AppointmentsPage's day panel below) instead of the
// plain toolbar button, which leaves it blank (today's date, as before).
function BookAppointmentDialog({ initialDate, triggerLabel = 'Book appointment' }: { initialDate?: string; triggerLabel?: string }) {
  const [open, setOpen] = useState(false)
  const createAppointment = useCreateAppointment()
  const { data: doctors } = useDoctors()

  const form = useForm<AppointmentForm>({
    resolver: zodResolver(appointmentFormSchema),
    defaultValues: { patient: '', doctor: '', date: initialDate ?? '', startTime: '', endTime: '', reason: '' },
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
        if (next) form.reset({ patient: '', doctor: '', date: initialDate ?? '', startTime: '', endTime: '', reason: '' })
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Book an appointment</DialogTitle>
          <DialogDescription>Checks for a conflicting slot on the chosen doctor's schedule automatically.</DialogDescription>
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

            <FormField
              control={form.control}
              name="doctor"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Doctor</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a doctor" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {doctors?.map((doctor) => (
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

            <div className="grid grid-cols-2 gap-x-4 gap-y-4">
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

// The status-change dropdown shown on each row, for anyone who holds the
// 'appointment.update' permission. An admin or nurse can change any row's
// status, while a doctor can only change the status of their own
// appointments (see appointment.service.ts's updateAppointmentStatus, which
// only restricts the doctor case). The server checks this same rule again
// on its own, regardless of what this component happens to show.
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
      <SelectTrigger size="sm" className="w-auto border-none bg-transparent p-0 shadow-none [&_svg]:text-slate-600">
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

// The appointment statuses where starting a clinical encounter still makes
// sense. A cancelled, no-show, or already-completed visit has nothing left
// to record against it. The server places no such restriction itself
// (createEncounter doesn't check the appointment's status at all), so this
// is purely a UI guard against an action that would technically still work
// but would never actually make sense to take.
const ENCOUNTER_ELIGIBLE_STATUSES: AppointmentStatus[] = ['BOOKED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS']

// This is for nurses only, since only they hold the 'encounter.create'
// permission (vitals must be recorded by a nurse before a doctor sees the
// patient). It opens a new Encounter tied to this appointment and takes the
// nurse straight into the clinical workspace for it. This only ever shows on
// a row that has no encounter yet — once appt.encounter is set, it's
// replaced by an "Open encounter" link instead. That link is what lets a
// doctor find and continue the encounter the nurse started, without anyone
// having to share a URL by hand.
function StartEncounterDialog({ appointment }: { appointment: Appointment }) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const createEncounter = useCreateEncounter()
  const form = useForm<EncounterForm>({
    resolver: zodResolver(encounterFormSchema),
    defaultValues: { chiefComplaint: '', history: '' },
  })

  if (!isPopulated(appointment.patient)) return null

  async function onSubmit(values: EncounterForm) {
    if (!isPopulated(appointment.patient)) return
    try {
      const encounter = await createEncounter.mutateAsync({
        patient: appointment.patient._id,
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

// The table used by both the list view and the calendar view's day panel
// below — pulled out once so a day's filtered appointments render with
// exactly the same status-update/encounter-action behavior as the full
// list, rather than a second, drifting copy of the same markup.
function AppointmentsTable({
  appointments,
  isLoading,
  canUpdate,
  canStartEncounter,
  canViewEncounter,
  emptyTitle,
  emptyDescription,
}: {
  appointments: Appointment[]
  isLoading: boolean
  canUpdate: boolean
  canStartEncounter: boolean
  canViewEncounter: boolean
  emptyTitle: string
  emptyDescription: string
}) {
  const showEncounterColumn = canStartEncounter || canViewEncounter

  return (
    <div className="rounded-lg border border-border bg-card shadow-sm">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50 hover:bg-slate-50">
            <TableHead>Patient</TableHead>
            <TableHead>Doctor</TableHead>
            <TableHead>
              <span className="flex items-center gap-1">
                <CalendarDays className="size-3" /> Date
              </span>
            </TableHead>
            <TableHead>
              <span className="flex items-center gap-1">
                <Clock className="size-3" /> Time
              </span>
            </TableHead>
            <TableHead>Status</TableHead>
            {showEncounterColumn && <TableHead className="text-right">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading &&
            Array.from({ length: 6 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: showEncounterColumn ? 6 : 5 }).map((__, j) => (
                  <TableCell key={j}>
                    <Skeleton className="h-4 w-20" />
                  </TableCell>
                ))}
              </TableRow>
            ))}

          {!isLoading &&
            appointments.map((appt) => (
              <TableRow key={appt._id}>
                <TableCell className="font-medium text-slate-900">
                  {isPopulated(appt.patient) ? `${appt.patient.firstName} ${appt.patient.lastName}` : 'You'}
                </TableCell>
                <TableCell className="text-slate-700">
                  {isPopulated(appt.doctor) ? `Dr. ${appt.doctor.firstName} ${appt.doctor.lastName}` : 'You'}
                </TableCell>
                <TableCell className="text-slate-700">{formatShortDate(appt.date)}</TableCell>
                <TableCell className="tabular-nums text-slate-700">
                  {appt.startTime}–{appt.endTime}
                </TableCell>
                <TableCell>{canUpdate ? <StatusSelect appointment={appt} /> : <StatusBadge status={appt.status} />}</TableCell>
                {showEncounterColumn && (
                  <TableCell className="text-right">
                    {appt.encounter ? (
                      // An encounter already exists for this appointment
                      // (opened by the nurse — see Appointment.encounter's
                      // reverse-link comment on models/Appointment.ts), so
                      // this links straight to it instead of offering to
                      // start a second one. It checks canViewEncounter
                      // rather than canStartEncounter because this is a
                      // doctor's main way to reach an encounter — a doctor
                      // can never start one themselves.
                      canViewEncounter && (
                        <Button asChild size="sm" variant="ghost">
                          <Link to={`/encounters/${appt.encounter}`}>
                            Open encounter <ArrowUpRight className="size-4" />
                          </Link>
                        </Button>
                      )
                    ) : (
                      canStartEncounter &&
                      ENCOUNTER_ELIGIBLE_STATUSES.includes(appt.status) && <StartEncounterDialog appointment={appt} />
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
        </TableBody>
      </Table>

      {!isLoading && appointments.length === 0 && (
        <EmptyState icon={CalendarDays} title={emptyTitle} description={emptyDescription} />
      )}
    </div>
  )
}

export function AppointmentsPage() {
  const { hasPermission, user } = useAuth()
  const { data: appointments, isLoading } = useAppointments()
  const [view, setView] = useState<'list' | 'calendar'>('list')
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  const canCreate = hasPermission('appointment.create')
  const canUpdate = hasPermission('appointment.update')
  const canStartEncounter = hasPermission('encounter.create')
  // This is kept separate from canStartEncounter because a doctor holds
  // 'encounter.read' but not 'encounter.create' (only a nurse can open a new
  // encounter — see permissions.ts). So "can view an existing encounter" and
  // "can start a new one" are two different permissions, not one. The
  // Actions column needs to show up for anyone who can do either of those
  // things. If it only checked canStartEncounter, a doctor would lose their
  // only way to reach the "Open encounter" link on this page.
  const canViewEncounter = hasPermission('encounter.read')
  // Whether this role sees the whole appointment list or just their own is
  // a separate question from who is allowed to book one. Admin and Nurse
  // both see every appointment (see listAppointments' ADMIN/NURSE branch):
  // Admin sees everything despite not holding 'appointment.create' at all,
  // and Doctor sees only their own despite no longer being able to book
  // appointments either. So this text is based on the user's role directly,
  // rather than on `canCreate`, which would mix up two unrelated things.
  const seesEveryAppointment = user?.role.name === 'ADMIN' || user?.role.name === 'NURSE'

  const selectedDayKey = selectedDay ? toDateKey(selectedDay) : null
  const selectedDayAppointments = selectedDayKey
    ? (appointments ?? []).filter((appt) => toDateKeyUTC(new Date(appt.date)) === selectedDayKey)
    : []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">
          {seesEveryAppointment ? 'Every appointment in the system.' : 'Appointments involving you.'}
        </p>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-border p-0.5">
            <Button
              variant={view === 'list' ? 'default' : 'ghost'}
              size="sm"
              className="h-8"
              onClick={() => setView('list')}
            >
              <LayoutList className="size-4" /> List
            </Button>
            <Button
              variant={view === 'calendar' ? 'default' : 'ghost'}
              size="sm"
              className="h-8"
              onClick={() => setView('calendar')}
            >
              <CalendarDays className="size-4" /> Calendar
            </Button>
          </div>
          {canCreate && <BookAppointmentDialog />}
        </div>
      </div>

      {view === 'list' && (
        <AppointmentsTable
          appointments={appointments ?? []}
          isLoading={isLoading}
          canUpdate={canUpdate}
          canStartEncounter={canStartEncounter}
          canViewEncounter={canViewEncounter}
          emptyTitle="No appointments yet"
          emptyDescription={canCreate ? 'Book the first appointment to get started.' : 'Nothing scheduled yet.'}
        />
      )}

      {view === 'calendar' && (
        <div className="space-y-4">
          <AppointmentCalendar appointments={appointments ?? []} onSelectDay={setSelectedDay} />

          {selectedDay && (
            <div className="space-y-3 rounded-lg border border-border bg-card p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-900">
                  {formatLongDate(selectedDay)}
                </p>
                {canCreate && <BookAppointmentDialog initialDate={selectedDayKey ?? undefined} triggerLabel="Book for this day" />}
              </div>
              <AppointmentsTable
                appointments={selectedDayAppointments}
                isLoading={false}
                canUpdate={canUpdate}
                canStartEncounter={canStartEncounter}
                canViewEncounter={canViewEncounter}
                emptyTitle="Nothing booked"
                emptyDescription={canCreate ? 'Book an appointment for this day.' : 'Nothing scheduled for this day.'}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
