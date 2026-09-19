import { useState } from 'react'
import { ScrollText, ChevronLeft, ChevronRight } from 'lucide-react'
import { useAuditLogs } from './api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/EmptyState'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatDateTime } from '@/lib/date'

const PAGE_SIZE = 50

// The server filters by exact matching (`query.action = filters.action` and
// `query.resource = filters.resource` — see auditLog.service.ts; there's no
// partial or case-insensitive matching). That means a free-text search box
// would silently return zero results if the typed text didn't match the
// stored casing exactly. Using dropdowns of the real, fixed set of values
// that every logAction() call in the backend actually uses (found by
// searching across every controller) avoids that problem. There's no shared
// list of these values on the backend, so this list has to be updated by
// hand whenever a new action gets logged there.
const KNOWN_ACTIONS = [
  'LOGIN_SUCCESS',
  'LOGIN_FAILURE',
  'LOGOUT',
  'PASSWORD_RESET',
  'USER_CREATED',
  'PATIENT_REGISTERED',
  'PATIENT_UPDATED',
  'APPOINTMENT_BOOKED',
  'APPOINTMENT_STATUS_UPDATED',
  'ENCOUNTER_OPENED',
  'VITALS_RECORDED',
  'VITALS_UPDATED',
  'DIAGNOSIS_ADDED',
  'DIAGNOSIS_UPDATED',
  'ENCOUNTER_COMPLETED',
  'LAB_ORDER_CREATED',
  'LAB_ORDER_UPDATED',
  'LAB_RESULT_ENTERED',
  'LAB_RESULT_RELEASED',
  'AI_CONSULTED',
  'AI_CONSULTATION_REVIEWED',
  'INVOICE_CREATED',
  'PAYMENT_RECORDED',
] as const

const KNOWN_RESOURCES = [
  'User',
  'Patient',
  'Appointment',
  'Encounter',
  'LabOrder',
  'LabResult',
  'AiConsultation',
  'Invoice',
  'Payment',
] as const


// Turns 'LAB_RESULT_RELEASED' into 'Lab result released'. The raw action
// names (see audit.service.ts's call sites) are written in
// ALL_CAPS_WITH_UNDERSCORES, which is meant for filtering by code, not for
// showing to a person.
function humanizeAction(action: string) {
  const lower = action.toLowerCase().replace(/_/g, ' ')
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

export function AuditLogsPage() {
  const [action, setAction] = useState('ALL')
  const [resource, setResource] = useState('ALL')
  const [page, setPage] = useState(1)

  const { data, isLoading } = useAuditLogs({
    action: action === 'ALL' ? undefined : action,
    resource: resource === 'ALL' ? undefined : resource,
    page,
    limit: PAGE_SIZE,
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={action}
          onValueChange={(v) => {
            setAction(v)
            setPage(1)
          }}
        >
          <SelectTrigger size="sm" className="w-56">
            <SelectValue placeholder="Action" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All actions</SelectItem>
            {KNOWN_ACTIONS.map((a) => (
              <SelectItem key={a} value={a}>
                {humanizeAction(a)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={resource}
          onValueChange={(v) => {
            setResource(v)
            setPage(1)
          }}
        >
          <SelectTrigger size="sm" className="w-44">
            <SelectValue placeholder="Resource" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All resources</SelectItem>
            {KNOWN_RESOURCES.map((r) => (
              <SelectItem key={r} value={r}>
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border border-border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 hover:bg-slate-50">
              <TableHead>Action</TableHead>
              <TableHead>Resource</TableHead>
              <TableHead>By</TableHead>
              <TableHead>IP</TableHead>
              <TableHead>When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 5 }).map((__, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}

            {!isLoading &&
              data?.logs.map((log) => (
                <TableRow key={log._id} className="hover:bg-slate-50/60">
                  <TableCell className="text-slate-900">{humanizeAction(log.action)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
                      {log.resource}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-slate-700">
                    {log.user ? `${log.user.firstName} ${log.user.lastName}` : <span className="text-slate-600">System</span>}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-slate-600">{log.ipAddress || '—'}</TableCell>
                  <TableCell className="text-xs text-slate-600">{formatDateTime(log.createdAt)}</TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>

        {!isLoading && data?.logs.length === 0 && (
          <EmptyState icon={ScrollText} title="No matching entries" description="Try a different action or resource filter." />
        )}

        {data && data.total > 0 && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            <p className="text-xs text-slate-600">
              Showing {(data.page - 1) * data.limit + 1}-{Math.min(data.page * data.limit, data.total)} of {data.total}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                <ChevronLeft className="size-4" /> Prev
              </Button>
              <Button variant="outline" size="sm" disabled={page >= data.pages} onClick={() => setPage((p) => Math.min(data.pages, p + 1))}>
                Next <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
