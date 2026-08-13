import { useState } from 'react'
import { ScrollText, ChevronLeft, ChevronRight } from 'lucide-react'
import { useAuditLogs } from './api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/EmptyState'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const PAGE_SIZE = 50

// The backend filters by EXACT equality (`query.action = filters.action`,
// `query.resource = filters.resource` — see auditLog.service.ts, no regex/
// partial matching), so a free-text field would silently return zero
// results for anything not typed in the exact stored casing. Dropdowns of
// the real, fixed set of values every logAction() call site in the backend
// actually uses (grepped across every controller) give a correct filter
// experience instead. No shared enum exists for these on the backend, so
// this list has to be kept in sync by hand if a new action is ever logged.
const KNOWN_ACTIONS = [
  'LOGIN_SUCCESS',
  'LOGIN_FAILURE',
  'LOGOUT',
  'PASSWORD_RESET',
  'USER_CREATED',
  'PATIENT_REGISTERED',
  'PATIENT_UPDATED',
  'DEPARTMENT_CREATED',
  'DEPARTMENT_UPDATED',
  'APPOINTMENT_BOOKED',
  'APPOINTMENT_STATUS_UPDATED',
  'ENCOUNTER_OPENED',
  'VITALS_RECORDED',
  'DIAGNOSIS_ADDED',
  'LAB_ORDER_CREATED',
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
  'Department',
  'Appointment',
  'Encounter',
  'LabOrder',
  'LabResult',
  'AiConsultation',
  'Invoice',
  'Payment',
] as const

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

// Turns 'LAB_RESULT_RELEASED' into 'Lab result released' — the raw action
// constants (see audit.service.ts's call sites) are SCREAMING_SNAKE_CASE,
// meant for machine filtering, not display.
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
              <TableHead className="text-xs font-medium tracking-wider text-slate-500 uppercase">Action</TableHead>
              <TableHead className="text-xs font-medium tracking-wider text-slate-500 uppercase">Resource</TableHead>
              <TableHead className="text-xs font-medium tracking-wider text-slate-500 uppercase">By</TableHead>
              <TableHead className="text-xs font-medium tracking-wider text-slate-500 uppercase">IP</TableHead>
              <TableHead className="text-xs font-medium tracking-wider text-slate-500 uppercase">When</TableHead>
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
                    {log.user ? `${log.user.firstName} ${log.user.lastName}` : <span className="text-slate-400">System</span>}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-slate-500">{log.ipAddress || '—'}</TableCell>
                  <TableCell className="text-xs text-slate-500">{formatWhen(log.createdAt)}</TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>

        {!isLoading && data?.logs.length === 0 && (
          <EmptyState icon={ScrollText} title="No matching entries" description="Try a different action or resource filter." />
        )}

        {data && data.total > 0 && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            <p className="text-xs text-slate-500">
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
