import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Stethoscope } from 'lucide-react'
import { useAuth } from '@/features/auth/useAuth'
import { useEncounters } from './api'
import { ENCOUNTER_STATUSES, type EncounterStatus } from '@/types/encounter'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/EmptyState'
import { StatusBadge } from '@/components/StatusBadge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

// The one place every role that holds 'encounter.read' (Admin, Nurse,
// Doctor) can browse encounters — previously the only way to reach one was
// the Appointment's reverse-link (see AppointmentsPage's "Open encounter")
// or a URL relayed out of band. Row click goes to the existing detail
// workspace at /encounters/:id, unchanged.
export function EncountersListPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [statusFilter, setStatusFilter] = useState<EncounterStatus | 'ALL'>('ALL')
  const { data: encounters, isLoading } = useEncounters(statusFilter === 'ALL' ? undefined : statusFilter)
  // listEncounters() only scopes the list down for DOCTOR (their own
  // encounters) — Admin and Nurse both see every encounter, same
  // distinction already established on the Lab Orders page.
  const seesEveryEncounter = user?.role.name !== 'DOCTOR'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          {seesEveryEncounter ? 'Every encounter in the system.' : 'Encounters you\'re running.'}
        </p>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as EncounterStatus | 'ALL')}>
          <SelectTrigger size="sm" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            {ENCOUNTER_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s === 'IN_PROGRESS' ? 'In progress' : 'Completed'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border border-border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 hover:bg-slate-50">
              <TableHead className="text-xs font-medium tracking-wider text-slate-500 uppercase">Patient</TableHead>
              <TableHead className="text-xs font-medium tracking-wider text-slate-500 uppercase">Doctor</TableHead>
              <TableHead className="text-xs font-medium tracking-wider text-slate-500 uppercase">Department</TableHead>
              <TableHead className="text-xs font-medium tracking-wider text-slate-500 uppercase">Chief complaint</TableHead>
              <TableHead className="text-xs font-medium tracking-wider text-slate-500 uppercase">Started</TableHead>
              <TableHead className="text-xs font-medium tracking-wider text-slate-500 uppercase">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((__, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}

            {!isLoading &&
              encounters?.map((enc) => (
                <TableRow
                  key={enc._id}
                  tabIndex={0}
                  role="link"
                  className="cursor-pointer focus-visible:bg-blue-50 focus-visible:outline-none"
                  onClick={() => navigate(`/encounters/${enc._id}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      navigate(`/encounters/${enc._id}`)
                    }
                  }}
                >
                  <TableCell className="font-medium text-slate-900">
                    {enc.patient.firstName} {enc.patient.lastName}
                  </TableCell>
                  <TableCell className="text-slate-700">
                    Dr. {enc.doctor.firstName} {enc.doctor.lastName}
                  </TableCell>
                  <TableCell className="text-slate-700">{enc.department.name}</TableCell>
                  <TableCell className="max-w-xs truncate text-slate-700">{enc.chiefComplaint}</TableCell>
                  <TableCell className="text-xs text-slate-500">{formatWhen(enc.startedAt)}</TableCell>
                  <TableCell>
                    <StatusBadge status={enc.status} />
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>

        {!isLoading && encounters?.length === 0 && (
          <EmptyState
            icon={Stethoscope}
            title="No encounters yet"
            description="Encounters opened from an appointment or as a walk-in will show up here."
          />
        )}
      </div>
    </div>
  )
}
