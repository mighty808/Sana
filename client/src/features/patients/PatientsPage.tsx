import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Search, Plus, Users, ChevronLeft, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { usePatients, useCreatePatient } from './api'
import { BLOOD_GROUPS } from '@/types/patient'
import { getApiErrorMessage } from '@/lib/api'
import { useAuth } from '@/features/auth/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'

// Mirrors server/src/schemas/patient.ts's createPatientSchema — same field
// names/requirements, so client-side validation never disagrees with what
// the backend will actually accept.
const patientFormSchema = z.object({
  firstName: z.string().trim().min(1, 'Required'),
  lastName: z.string().trim().min(1, 'Required'),
  dob: z.string().min(1, 'Required'),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']),
  phone: z.string().trim().optional(),
  email: z.string().trim().toLowerCase().email('Enter a valid email').optional().or(z.literal('')),
  bloodGroup: z.enum(BLOOD_GROUPS).optional(),
  emergencyContactName: z.string().trim().optional(),
  emergencyContactPhone: z.string().trim().optional(),
})
type PatientForm = z.infer<typeof patientFormSchema>

const PAGE_SIZE = 20

function AddPatientDialog() {
  const [open, setOpen] = useState(false)
  const createPatient = useCreatePatient()

  const form = useForm<PatientForm>({
    resolver: zodResolver(patientFormSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      dob: '',
      gender: 'MALE',
      phone: '',
      email: '',
      emergencyContactName: '',
      emergencyContactPhone: '',
    },
  })

  async function onSubmit(values: PatientForm) {
    try {
      const { emergencyContactName, emergencyContactPhone, ...rest } = values
      const patient = await createPatient.mutateAsync({
        ...rest,
        email: values.email || undefined,
        emergencyContact:
          emergencyContactName || emergencyContactPhone
            ? { name: emergencyContactName || undefined, phone: emergencyContactPhone || undefined }
            : undefined,
      })
      toast.success(`${patient.firstName} ${patient.lastName} registered as ${patient.patientNumber}`)
      form.reset()
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
        // Reset any half-filled values left over from a cancelled attempt,
        // so reopening the dialog always starts from a clean form.
        if (next) form.reset()
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> Add patient
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Register a new patient</DialogTitle>
          <DialogDescription>A patient number is generated automatically once saved.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-4">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>First name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="dob"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date of birth</FormLabel>
                    <FormControl>
                      <Input type="date" max={new Date().toISOString().slice(0, 10)} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="gender"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Gender</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="MALE">Male</SelectItem>
                        <SelectItem value="FEMALE">Female</SelectItem>
                        <SelectItem value="OTHER">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="bloodGroup"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Blood group</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Unknown" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {BLOOD_GROUPS.map((bg) => (
                          <SelectItem key={bg} value={bg}>
                            {bg}
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
                name="emergencyContactName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Emergency contact name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="emergencyContactPhone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Emergency contact phone</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? 'Saving…' : 'Register patient'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

export function PatientsPage() {
  const navigate = useNavigate()
  const { hasPermission } = useAuth()
  // `search` updates on every keystroke (so the input never feels laggy);
  // `debouncedSearch` is what actually drives the query, so typing
  // "Akosua" fires one request instead of one per character against
  // MongoDB's $text index.
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timeout)
  }, [search])

  const { data, isLoading } = usePatients({ search: debouncedSearch || undefined, page, limit: PAGE_SIZE })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search by name, patient number, or phone"
            className="h-10 pl-9"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
        </div>
        {hasPermission('patient.create') && <AddPatientDialog />}
      </div>

      <div className="rounded-lg border border-border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 hover:bg-slate-50">
              <TableHead className="text-xs font-medium tracking-wider text-slate-500 uppercase">Patient</TableHead>
              <TableHead className="text-xs font-medium tracking-wider text-slate-500 uppercase">Patient no.</TableHead>
              <TableHead className="text-xs font-medium tracking-wider text-slate-500 uppercase">Gender</TableHead>
              <TableHead className="text-xs font-medium tracking-wider text-slate-500 uppercase">Phone</TableHead>
              <TableHead className="text-xs font-medium tracking-wider text-slate-500 uppercase">Blood group</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 5 }).map((__, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}

            {!isLoading &&
              data?.patients.map((patient) => (
                <TableRow
                  key={patient._id}
                  tabIndex={0}
                  role="link"
                  className="cursor-pointer focus-visible:bg-blue-50 focus-visible:outline-none"
                  onClick={() => navigate(`/patients/${patient._id}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      navigate(`/patients/${patient._id}`)
                    }
                  }}
                >
                  <TableCell className="font-medium text-slate-900">
                    {patient.firstName} {patient.lastName}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-slate-500">{patient.patientNumber}</TableCell>
                  <TableCell className="text-slate-700 capitalize">{patient.gender.toLowerCase()}</TableCell>
                  <TableCell className="text-slate-700">{patient.phone || '—'}</TableCell>
                  <TableCell className="text-slate-700">{patient.bloodGroup ?? 'UNKNOWN'}</TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>

        {!isLoading && data?.patients.length === 0 && (
          <EmptyState
            icon={Users}
            title={debouncedSearch ? 'No patients match your search' : 'No patients yet'}
            description={
              debouncedSearch
                ? 'Try a different name, patient number, or phone number.'
                : 'Register the first patient to start building the record.'
            }
          />
        )}

        {data && data.total > 0 && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            <p className="text-xs text-slate-500">
              Showing {(data.page - 1) * data.limit + 1}-{Math.min(data.page * data.limit, data.total)} of{' '}
              {data.total}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="size-4" /> Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= data.pages}
                onClick={() => setPage((p) => Math.min(data.pages, p + 1))}
              >
                Next <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
