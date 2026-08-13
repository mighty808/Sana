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

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function LabResultsPage() {
  const { hasPermission } = useAuth()
  const { data: results, isLoading } = useLabResults()
  const releaseResult = useReleaseLabResult()
  const canRelease = hasPermission('labresult.release')

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
      {/* Note: the API doesn't populate a patient name or lab order number
          onto results (see labResult.service.ts's listLabResults — it's a
          raw find() with no .populate()), so this list is scoped by role
          (a Doctor only ever sees their own orders' results, a Patient only
          their own released ones) rather than showing whose result each
          row belongs to by name. */}
      <p className="text-sm text-slate-500">
        {canRelease
          ? 'Every result — release one to make it visible to the patient.'
          : 'Results for your orders.'}
      </p>

      <div className="rounded-lg border border-border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 hover:bg-slate-50">
              <TableHead className="text-xs font-medium tracking-wider text-slate-500 uppercase">Test</TableHead>
              <TableHead className="text-xs font-medium tracking-wider text-slate-500 uppercase">Result</TableHead>
              <TableHead className="text-xs font-medium tracking-wider text-slate-500 uppercase">Reference range</TableHead>
              <TableHead className="text-xs font-medium tracking-wider text-slate-500 uppercase">Interpretation</TableHead>
              <TableHead className="text-xs font-medium tracking-wider text-slate-500 uppercase">Resulted</TableHead>
              <TableHead className="text-xs font-medium tracking-wider text-slate-500 uppercase">Status</TableHead>
              {canRelease && (
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
                  {Array.from({ length: canRelease ? 7 : 6 }).map((__, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}

            {!isLoading &&
              results?.map((result) => (
                <TableRow key={result._id}>
                  <TableCell className="font-medium text-slate-900">{result.testName}</TableCell>
                  <TableCell className="tabular-nums text-slate-700">
                    {result.resultValue}
                    {result.unit ? ` ${result.unit}` : ''}
                  </TableCell>
                  <TableCell className="text-slate-500">{result.referenceRange || '—'}</TableCell>
                  <TableCell>
                    {result.interpretation ? <StatusBadge status={result.interpretation} /> : '—'}
                  </TableCell>
                  <TableCell className="text-slate-700">{formatDate(result.resultedAt)}</TableCell>
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
