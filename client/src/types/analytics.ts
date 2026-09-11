// GET /analytics/trends — matches analytics.service.ts's getTrends() exactly.
// Unlike DashboardSummary, this is one fixed shape for every caller (only
// Admin can ever reach it, via the 'analytics.readTrends' permission), so
// there's no role-based union here.
export interface AnalyticsTrends {
  rangeDays: number
  appointmentVolume: { date: string; count: number }[]
  revenue: { date: string; amount: number }[]
  appointmentStatusBreakdown: { status: string; count: number }[]
  labTurnaround: { week: string; avgHours: number }[]
}
