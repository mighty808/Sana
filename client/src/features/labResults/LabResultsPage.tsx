import { FlaskConical, Send } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/features/auth/useAuth'
import { useLabResults, useReleaseLabResult } from './api'
import { getApiErrorMessage } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/StatusBadge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/EmptyState'
import { formatShortDate } from '@/lib/date'

export function LabResultsPage() {
  const { user, hasPermission } = useAuth()
  const { data: results, isLoading } = useLabResults()
  const releaseResult = useReleaseLabResult()
  const canRelease = hasPermission('labresult.release')
  // A Patient's own results are obviously all theirs — no column needed.
  // Everyone else (Admin/Doctor/Lab Tech) can see multiple patients' results
  // in this same list, so the patient needs to be identified per row.
  const showPatientColumn = user?.role.name !== 'PATIENT'

  async function handleRelease(id: string, testName: string) {
    try {
      await releaseResult.mutateAsync(id)
      toast.success(`${testName} released to the patient`)
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        {canRelease
          ? 'Every result — release one to make it visible to the patient.'
          : 'Results for your orders.'}
      </p>

      <div className="rounded-lg border border-border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 hover:bg-slate-50">
              {showPatientColumn && (
                <TableHead>Patient</TableHead>
              )}
              <TableHead>Test</TableHead>
              <TableHead>Result</TableHead>
              <TableHead>Reference range</TableHead>
              <TableHead>Interpretation</TableHead>
              <TableHead>Resulted</TableHead>
              <TableHead>Status</TableHead>
              {canRelease && (
                <TableHead className="text-right">
                  Actions
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 + (canRelease ? 1 : 0) + (showPatientColumn ? 1 : 0) }).map((__, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}

            {!isLoading &&
              results?.map((result) => (
                <TableRow key={result._id}>
                  {showPatientColumn && (
                    <TableCell className="text-slate-700">
                      {/* The type says `patient` is always populated (see
                          types/labResult.ts), but that's a populate-time
                          contract, not a runtime guarantee — an orphaned
                          reference would come back null and crash this
                          whole table for every row, not just its own, so
                          this stays defensive the same way
                          labResult.service.ts's releaseLabResult guards
                          the identical populate('patient') server-side. */}
                      {result.patient ? `${result.patient.firstName} ${result.patient.lastName}` : '—'}
                    </TableCell>
                  )}
                  <TableCell className="font-medium text-slate-900">{result.testName}</TableCell>
                  <TableCell className="tabular-nums text-slate-700">
                    {result.resultValue}
                    {result.unit ? ` ${result.unit}` : ''}
                  </TableCell>
                  <TableCell className="text-slate-600">{result.referenceRange || '—'}</TableCell>
                  <TableCell>
                    {result.interpretation ? <StatusBadge status={result.interpretation} /> : '—'}
                  </TableCell>
                  <TableCell className="text-slate-700">{formatShortDate(result.resultedAt)}</TableCell>
                  <TableCell>
                    <StatusBadge status={result.status} />
                  </TableCell>
                  {canRelease && (
                    <TableCell className="text-right">
                      {result.status === 'ENTERED' && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={releaseResult.isPending}
                          onClick={() => handleRelease(result._id, result.testName)}
                        >
                          <Send className="size-4" /> Release
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
          </TableBody>
        </Table>

        {!isLoading && results?.length === 0 && (
          <EmptyState icon={FlaskConical} title="No results yet" description="Results entered against your lab orders will show up here." />
        )}
      </div>
    </div>
  )
}
