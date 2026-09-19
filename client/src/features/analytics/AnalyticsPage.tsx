import {
  CartesianGrid,
  Line,
  LineChart,
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useAnalyticsTrends } from './api'
import { formatMoney } from '@/lib/money'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/EmptyState'
import { ChartColumn } from 'lucide-react'

// Solid fill colors, one per chart's single series — reusing Sana's own
// design tokens (index.css) rather than inventing new ones: primary blue for
// volume, the same success green Badge/StatusBadge uses for a healthy state
// (revenue coming in), the same warning amber for something time-sensitive
// (turnaround waiting on a result).
const VOLUME_COLOR = '#2563EB' // --primary
const REVENUE_COLOR = '#16A34A' // --success
const TURNAROUND_COLOR = '#D97706' // --warning

// Appointment status colors mirror StatusBadge.tsx's own hue choices exactly
// (just solid fills here instead of pastel badge backgrounds), so a status
// reads as the same color everywhere in the app, not just on this one chart.
// Ordered by the appointment lifecycle (see models/Appointment.ts's
// APPOINTMENT_STATUSES) rather than alphabetically, so the bars tell the
// story of a visit progressing left to right — a fixed order, never
// re-sorted by count, so a status's color/position never shifts between visits.
const STATUS_ORDER = ['BOOKED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW']
const STATUS_COLORS: Record<string, string> = {
  BOOKED: '#3B82F6',
  CONFIRMED: '#0EA5E9',
  CHECKED_IN: '#F59E0B',
  IN_PROGRESS: '#A855F7',
  COMPLETED: '#16A34A',
  CANCELLED: '#94A3B8',
  NO_SHOW: '#DC2626',
}
const STATUS_LABELS: Record<string, string> = {
  CHECKED_IN: 'Checked in',
  IN_PROGRESS: 'In progress',
  NO_SHOW: 'No show',
}
function statusLabel(status: string) {
  return STATUS_LABELS[status] ?? status[0] + status.slice(1).toLowerCase()
}

// Server dates arrive as plain "YYYY-MM-DD" strings (a calendar day, not a
// specific moment — see analytics.service.ts's daysAgo/startOfWeek). Parsing
// the year/month/day components directly into a local Date, rather than
// `new Date(isoDate)` (which reads the string as UTC midnight), avoids the
// date silently shifting a day earlier in any timezone behind UTC.
function formatChartDate(isoDate: string) {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// One axis, one hue, a light grid, a tooltip on hover — the shared shape
// behind both single-series line charts below (appointment volume, revenue).
function TrendLineChart({
  data,
  dataKey,
  color,
  valueFormatter,
}: {
  data: { date: string }[]
  dataKey: string
  color: string
  valueFormatter?: (value: number) => string
}) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#EAECF0" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={formatChartDate}
          tick={{ fontSize: 12, fill: '#667085' }}
          axisLine={{ stroke: '#EAECF0' }}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 12, fill: '#667085' }}
          axisLine={false}
          tickLine={false}
          width={40}
          tickFormatter={valueFormatter}
        />
        <Tooltip
          labelFormatter={(label) => formatChartDate(label as string)}
          formatter={(value) => {
            const num = Number(value)
            return [valueFormatter ? valueFormatter(num) : num, undefined]
          }}
          contentStyle={{ borderRadius: 8, borderColor: '#EAECF0', fontSize: 13 }}
        />
        <Line
          type="monotone"
          dataKey={dataKey}
          stroke={color}
          strokeWidth={2}
          dot={{ r: 3, fill: color, strokeWidth: 0 }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

export function AnalyticsPage() {
  const { data, isLoading } = useAnalyticsTrends()

  const sortedStatusBreakdown =
    data?.appointmentStatusBreakdown
      .slice()
      .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)) ?? []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Analytics</h1>
        <p className="mt-1 text-sm text-slate-600">
          {data ? `Last ${data.rangeDays} days` : 'Hospital-wide trends'}
        </p>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-72 w-full rounded-lg" />
          ))}
        </div>
      )}

      {!isLoading && !data && (
        <EmptyState icon={ChartColumn} title="No data yet" description="Trends will appear once there's activity to chart." />
      )}

      {!isLoading && data && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Appointment volume</CardTitle>
            </CardHeader>
            <CardContent>
              <TrendLineChart data={data.appointmentVolume} dataKey="count" color={VOLUME_COLOR} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Revenue</CardTitle>
            </CardHeader>
            <CardContent>
              <TrendLineChart
                data={data.revenue}
                dataKey="amount"
                color={REVENUE_COLOR}
                valueFormatter={(v) => formatMoney(v)}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Appointment outcomes</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={sortedStatusBreakdown} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#EAECF0" vertical={false} />
                  <XAxis
                    dataKey="status"
                    tickFormatter={statusLabel}
                    tick={{ fontSize: 12, fill: '#667085' }}
                    axisLine={{ stroke: '#EAECF0' }}
                    tickLine={false}
                    interval={0}
                    angle={-20}
                    textAnchor="end"
                    height={50}
                  />
                  <YAxis tick={{ fontSize: 12, fill: '#667085' }} axisLine={false} tickLine={false} width={32} allowDecimals={false} />
                  <Tooltip
                    labelFormatter={(label) => statusLabel(label as string)}
                    contentStyle={{ borderRadius: 8, borderColor: '#EAECF0', fontSize: 13 }}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {sortedStatusBreakdown.map((entry) => (
                      <Cell key={entry.status} fill={STATUS_COLORS[entry.status] ?? '#94A3B8'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Lab turnaround time</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.labTurnaround} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#EAECF0" vertical={false} />
                  <XAxis
                    dataKey="week"
                    tickFormatter={formatChartDate}
                    tick={{ fontSize: 12, fill: '#667085' }}
                    axisLine={{ stroke: '#EAECF0' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 12, fill: '#667085' }}
                    axisLine={false}
                    tickLine={false}
                    width={40}
                    tickFormatter={(v: number) => `${v}h`}
                  />
                  <Tooltip
                    labelFormatter={(label) => `Week of ${formatChartDate(label as string)}`}
                    formatter={(value) => [`${Number(value)}h avg`, undefined]}
                    contentStyle={{ borderRadius: 8, borderColor: '#EAECF0', fontSize: 13 }}
                  />
                  <Bar dataKey="avgHours" fill={TURNAROUND_COLOR} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
