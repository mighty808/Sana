import { useNavigate } from 'react-router-dom'
import { AlertTriangle, HeartPulse } from 'lucide-react'
import { useWardBoard } from './api'
import type { WardBoardEntry } from '@/types/encounter'
import { ACUITY_STYLES } from '@/components/AiResponseCard'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/EmptyState'
import { formatDateTime } from '@/lib/date'

// Ranks an entry for sort order — CRITICAL first, then URGENT, then
// STABLE, then anyone nobody has assessed yet. Within the same level,
// whoever has been waiting the longest (oldest startedAt) comes first.
// This puts the patients most likely to need attention at the top of the
// screen, rather than sorting purely by when their encounter started.
const SEVERITY_RANK: Record<'CRITICAL' | 'URGENT' | 'STABLE' | 'UNASSESSED', number> = {
  CRITICAL: 3,
  URGENT: 2,
  STABLE: 1,
  UNASSESSED: 0,
}

function sortBoard(entries: WardBoardEntry[]): WardBoardEntry[] {
  return [...entries].sort((a, b) => {
    const rankA = SEVERITY_RANK[a.acuityLevel ?? 'UNASSESSED']
    const rankB = SEVERITY_RANK[b.acuityLevel ?? 'UNASSESSED']
    if (rankA !== rankB) return rankB - rankA
    return new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
  })
}

// A left accent bar per acuity level — separate from ACUITY_STYLES'
// badge colors (which pair a border/bg/text triad meant for a small pill,
// not a 4px accent edge on a whole card).
const ACCENT_BORDER: Record<'CRITICAL' | 'URGENT' | 'STABLE', string> = {
  CRITICAL: 'border-l-red-500',
  URGENT: 'border-l-amber-500',
  STABLE: 'border-l-green-500',
}

function WardBoardCard({ entry }: { entry: WardBoardEntry }) {
  const navigate = useNavigate()
  const acuity = entry.acuityLevel ? ACUITY_STYLES[entry.acuityLevel] : undefined
  const accentBorder = entry.acuityLevel ? ACCENT_BORDER[entry.acuityLevel] : 'border-l-border'

  return (
    <button
      type="button"
      onClick={() => navigate(`/encounters/${entry._id}`)}
      className={`flex flex-col gap-2 rounded-lg border border-border bg-card p-4 text-left shadow-sm transition-colors hover:bg-slate-50 border-l-4 ${accentBorder}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-900">
            {entry.patient.firstName} {entry.patient.lastName}
          </p>
          <p className="font-mono text-xs text-slate-600">{entry.patient.patientNumber}</p>
        </div>
        {acuity ? (
          <span
            className={`flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${acuity.className}`}
          >
            <AlertTriangle className="size-3" /> {acuity.label}
          </span>
        ) : (
          <span className="shrink-0 rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] text-slate-600">
            Not yet assessed
          </span>
        )}
      </div>

      <p className="truncate text-sm text-slate-700">{entry.chiefComplaint}</p>

      {acuity && entry.acuityReasons && entry.acuityReasons.length > 0 && (
        <p className="line-clamp-2 text-xs text-slate-600">{entry.acuityReasons.join('; ')}</p>
      )}

      <div className="mt-1 flex items-center justify-between text-xs text-slate-600">
        <span>Dr. {entry.doctor.firstName} {entry.doctor.lastName}</span>
        <span>Started {formatDateTime(entry.startedAt)}</span>
      </div>
    </button>
  )
}

// A one-screen view of every currently open encounter, color-coded by
// acuity, so a doctor (or admin/nurse — same role scoping as the
// Encounters list) can spot who's trending badly at a glance instead of
// opening each encounter one at a time. Polls every 30s (see
// useWardBoard) rather than pushing live updates, since acuity only
// changes when a nurse deliberately runs an AI vitals check — an
// infrequent event, not one that needs a dedicated live channel.
export function WardBoardPage() {
  const { data: board, isLoading } = useWardBoard()
  const sorted = board ? sortBoard(board) : undefined

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Every currently open encounter, most urgent first. Refreshes automatically every 30 seconds.
      </p>

      {isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-lg" />
          ))}
        </div>
      )}

      {!isLoading && sorted && sorted.length === 0 && (
        <EmptyState icon={HeartPulse} title="No open encounters" description="Encounters currently in progress will show up here." />
      )}

      {!isLoading && sorted && sorted.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((entry) => (
            <WardBoardCard key={entry._id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  )
}
