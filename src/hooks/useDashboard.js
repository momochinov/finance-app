import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { currentMonth } from '../lib/finance'

/**
 * Fetches all data needed by the Dashboard in one parallel shot.
 *
 * Queries (all via computed views):
 *   monthly_summary     – current month snapshot  (income/expenses/savings/saving_rate)
 *   net_worth_summary   – current month snapshot  (net_worth/liquid/long_term/allocation)
 *   goal_progress       – first goal forecast     (progress_pct/months_to_goal/…)
 *   monthly_summary     – last 6 months series    (savings bar chart)
 *   net_worth_summary   – last 6 months series    (net worth line chart)
 */
export function useDashboard() {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const month = currentMonth()

        const [
          { data: ms,       error: e1 },
          { data: nw,       error: e2 },
          { data: gp,       error: e3 },
          { data: msSeries, error: e4 },
          { data: nwSeries, error: e5 },
        ] = await Promise.all([
          // Current-month income/expenses/savings snapshot
          supabase
            .from('monthly_summary')
            .select('*')
            .eq('month', month)
            .maybeSingle(),

          // Current-month net worth + allocation snapshot
          supabase
            .from('net_worth_summary')
            .select('*')
            .eq('month', month)
            .maybeSingle(),

          // First goal's forecast data
          supabase
            .from('goal_progress')
            .select('*')
            .limit(1),

          // Last 6 months of monthly savings (for bar chart)
          supabase
            .from('monthly_summary')
            .select('month, savings, saving_rate')
            .order('month', { ascending: false })
            .limit(6),

          // Last 6 months of net worth (for line chart)
          supabase
            .from('net_worth_summary')
            .select('month, net_worth, liquid, long_term')
            .order('month', { ascending: false })
            .limit(6),
        ])

        const firstErr = e1 || e2 || e3 || e4 || e5
        if (firstErr) throw firstErr
        if (cancelled) return

        setData({
          monthSummary: ms ?? {},
          netWorthNow:  nw ?? {},
          goal:         gp?.[0] ?? null,
          // Reverse so charts render oldest → newest left-to-right
          monthlySeries: [...(msSeries ?? [])].reverse(),
          nwSeries:      [...(nwSeries  ?? [])].reverse(),
        })
      } catch (err) {
        if (!cancelled) setError(err?.message ?? 'Failed to load dashboard data')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [])

  return { data, loading, error }
}
