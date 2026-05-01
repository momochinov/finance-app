import {
  LineChart, Line,
  BarChart, Bar, Cell,
  XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { useDashboard } from '../hooks/useDashboard'
import { formatCurrency, formatMonth, fmtAxis } from '../lib/finance'
import Card       from '../components/Card'
import MetricCard from '../components/MetricCard'
import Spinner    from '../components/Spinner'
import Badge      from '../components/Badge'

const tooltipStyle = {
  contentStyle: {
    borderRadius: '10px',
    border: '1px solid #e2e8f0',
    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
    fontSize: '12px',
    padding: '8px 12px',
  },
  labelStyle: { color: '#64748b', fontWeight: 600, marginBottom: 2 },
  cursor: { fill: 'rgba(99,102,241,0.06)' },
}

// Accent → Tailwind class sets (avoids repeated ternary chains)
const ACCENT = {
  green:   { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: '#059669' },
  red:     { bg: 'bg-red-100',     text: 'text-red-600',     icon: '#ef4444' },
  amber:   { bg: 'bg-amber-100',   text: 'text-amber-700',   icon: '#d97706' },
  default: { bg: 'bg-slate-100',   text: 'text-slate-600',   icon: '#64748b' },
}

export default function Dashboard() {
  const { data, loading, error } = useDashboard()

  if (loading) return <Spinner />

  if (error) {
    return <div className="px-4 pt-10 text-center text-red-500 text-sm">{error}</div>
  }

  const { monthSummary, netWorthNow, goal, monthlySeries, nwSeries } = data

  // ── Monthly metrics (monthly_summary view) ────────────────
  const income     = Number(monthSummary?.income      ?? 0)
  const expenses   = Number(monthSummary?.expenses    ?? 0)
  const savings    = Number(monthSummary?.savings     ?? 0)
  const savingRate = Number(monthSummary?.saving_rate ?? 0)

  // ── Net worth (net_worth_summary view) ────────────────────
  const netWorth         = Number(netWorthNow?.net_worth     ?? 0)
  const liquid           = Number(netWorthNow?.liquid        ?? 0)
  const longTerm         = Number(netWorthNow?.long_term     ?? 0)
  const liquidPct        = Number(netWorthNow?.liquid_pct    ?? 0)
  const longTermPct      = Number(netWorthNow?.long_term_pct ?? 0)
  const debt             = Number(netWorthNow?.debt          ?? 0)
  const debtPct          = Number(netWorthNow?.debt_pct      ?? 0)

  // Month-over-month change from the 6-month series (oldest→newest after reverse)
  const nwChange = nwSeries.length >= 2
    ? Number(nwSeries[nwSeries.length - 1]?.net_worth ?? 0) -
      Number(nwSeries[nwSeries.length - 2]?.net_worth ?? 0)
    : null

  // ── Goal (goal_progress view) ─────────────────────────────
  const progressPct   = Number(goal?.progress_pct       ?? 0)
  const monthsToGoal  = goal?.months_to_goal            ?? null
  const estCompletion = goal?.estimated_completion_date ?? null
  const remaining     = Number(goal?.remaining_amount   ?? 0)

  // ── Trend analysis ───────────────────────────────────────
  // Compare first-half avg vs second-half avg of the monthly series.
  // Needs ≥ 4 months; with 6 months that's 3-vs-3.
  let savingsTrend = null
  if (monthlySeries.length >= 4) {
    const half     = Math.floor(monthlySeries.length / 2)
    const older    = monthlySeries.slice(0, half)
    const recent   = monthlySeries.slice(monthlySeries.length - half)
    const avgOlder  = older.reduce((s, m)  => s + Number(m.savings), 0) / half
    const avgRecent = recent.reduce((s, m) => s + Number(m.savings), 0) / half
    const pct = avgOlder !== 0
      ? Math.round((avgRecent - avgOlder) / Math.abs(avgOlder) * 100)
      : avgRecent > 0 ? 100 : 0
    savingsTrend = { pct, direction: pct > 5 ? 'up' : pct < -5 ? 'down' : 'flat' }
  }

  const trendInsight = savingsTrend
    ? savingsTrend.direction === 'up'
      ? "At current trend, you're accelerating toward your goal"
      : savingsTrend.direction === 'down'
        ? "Spending is slowing your progress"
        : "Savings are steady — keep the pace"
    : null

  // ── Derived colour accents ────────────────────────────────
  const savingAccent = savings >= 0     ? 'green' : 'red'
  const rateAccent   = savingRate >= 20 ? 'green' : savingRate >= 0 ? 'amber' : 'red'

  // ── Cash allocation insight ───────────────────────────────
  let allocAccent, allocStatus, allocDetail
  const hasBalances = liquidPct > 0 || longTermPct > 0
  if (!hasBalances) {
    allocAccent = 'default'
    allocStatus = 'No balance data yet'
    allocDetail = 'Add your accounts in Assets to see your allocation'
  } else if (liquidPct < 20) {
    allocAccent = 'red'
    allocStatus = 'Liquidity low'
    allocDetail = `Only ${liquidPct}% liquid — aim for 20–30% to cover 3–6 months of expenses`
  } else if (liquidPct < 30) {
    allocAccent = 'amber'
    allocStatus = 'Liquidity adequate'
    allocDetail = `${liquidPct}% liquid — healthy floor, keep above 20%`
  } else if (liquidPct > 70) {
    allocAccent = 'amber'
    allocStatus = 'High idle cash'
    allocDetail = `${liquidPct}% sitting liquid — consider putting more to work long-term`
  } else {
    allocAccent = 'green'
    allocStatus = 'Liquidity healthy'
    allocDetail = `${liquidPct}% liquid — good balance of accessible and invested funds`
  }
  const ac = ACCENT[allocAccent]

  // ── Goal decision microcopy ───────────────────────────────
  let goalMessage, goalBg, goalTextCls
  if (monthsToGoal === 0) {
    goalMessage = '🎉 Goal reached — congratulations!'
    goalBg      = 'bg-emerald-50'
    goalTextCls = 'text-emerald-700'
  } else if (!monthsToGoal) {
    goalMessage = 'Start saving consistently to generate a forecast'
    goalBg      = 'bg-slate-50'
    goalTextCls = 'text-slate-500'
  } else if (monthsToGoal <= 24) {
    goalMessage = `You're on track — ${monthsToGoal} months to go at your current pace`
    goalBg      = 'bg-emerald-50'
    goalTextCls = 'text-emerald-700'
  } else {
    goalMessage = `${monthsToGoal} months at current pace — consider increasing your monthly saving`
    goalBg      = 'bg-amber-50'
    goalTextCls = 'text-amber-700'
  }

  // ── Decision card ─────────────────────────────────────────────
  let decisionLabel, decisionDetail, decisionAction, decisionBg, decisionDot
  if (debt > 0 && debtPct > 20) {
    decisionLabel  = 'Debt is too high'
    decisionDetail = `Debt is ${debtPct}% of your assets — high debt costs more than investments earn.`
    decisionAction = 'Prioritise credit card repayment before increasing investments'
    decisionBg     = 'bg-red-50'
    decisionDot    = 'bg-red-500'
  } else if (debt > 0) {
    decisionLabel  = 'Pay down credit card'
    decisionDetail = `${formatCurrency(debt)} in credit card debt is reducing your net worth.`
    decisionAction = 'Clear the balance before directing surplus to long-term investments'
    decisionBg     = 'bg-amber-50'
    decisionDot    = 'bg-amber-400'
  } else if (savings < 0) {
    decisionLabel  = 'Stop the bleed'
    decisionDetail = `You spent ${formatCurrency(Math.abs(savings))} more than you earned this month.`
    decisionAction = 'Cut one variable category to get back into the black'
    decisionBg     = 'bg-red-50'
    decisionDot    = 'bg-red-500'
  } else if (savingRate < 10) {
    decisionLabel  = 'Boost your saving rate'
    decisionDetail = `You're saving only ${savingRate}% of income — the target is 20%+.`
    decisionAction = 'Find one recurring expense to reduce this month'
    decisionBg     = 'bg-amber-50'
    decisionDot    = 'bg-amber-400'
  } else if (liquidPct < 20 && (liquidPct > 0 || longTermPct > 0)) {
    decisionLabel  = 'Rebuild your cash buffer'
    decisionDetail = `Only ${liquidPct}% of assets are liquid — below the safe 20% floor.`
    decisionAction = 'Direct savings to liquid accounts until you hit 20%'
    decisionBg     = 'bg-amber-50'
    decisionDot    = 'bg-amber-400'
  } else if (monthsToGoal != null && monthsToGoal > 36) {
    decisionLabel  = 'Accelerate your goal'
    decisionDetail = `At current pace you're ${monthsToGoal > 120 ? Math.round(monthsToGoal / 12) + ' years' : monthsToGoal + ' months'} from your goal.`
    decisionAction = 'Adding $200/month could cut the timeline significantly'
    decisionBg     = 'bg-indigo-50'
    decisionDot    = 'bg-indigo-500'
  } else {
    decisionLabel  = 'On track'
    decisionDetail = `Saving ${formatCurrency(savings)}/month at a ${savingRate}% rate — keep it up.`
    decisionAction = 'Maintain the pace and check your Goal page for detail'
    decisionBg     = 'bg-emerald-50'
    decisionDot    = 'bg-emerald-500'
  }

  // ── Chart data ─────────────────────────────────────────────
  const savingsChartData = monthlySeries.map(s => ({
    month:  formatMonth(s.month),
    saving: Number(s.savings),
  }))
  const nwChartData = nwSeries.map(s => ({
    month:    formatMonth(s.month),
    netWorth: Number(s.net_worth),
  }))

  const monthLabel = new Date().toLocaleString('default', { month: 'long', year: 'numeric' })

  return (
    <div className="px-4 pb-8">

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="pt-8 pb-5">
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Overview</h1>
        <p className="text-sm text-slate-400 mt-0.5">{monthLabel}</p>
      </div>

      {/* ── Net Worth hero ─────────────────────────────────── */}
      <div className="rounded-2xl bg-slate-900 p-5 mb-6 shadow-md">
        <p className="text-slate-500 text-xs font-semibold uppercase tracking-widest mb-2">
          Net Worth
        </p>

        <div className="flex items-end gap-3 mb-1">
          <p className="text-4xl font-extrabold text-white tracking-tight leading-none">
            {formatCurrency(netWorth)}
          </p>
          {nwChange !== null && (
            <span className={`text-sm font-semibold pb-0.5 ${nwChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {nwChange >= 0 ? '▲' : '▼'} {formatCurrency(Math.abs(nwChange))}
            </span>
          )}
        </div>
        {nwChange !== null && (
          <p className="text-slate-600 text-xs mb-4">vs last month</p>
        )}

        {/* Allocation bar */}
        <div className="flex rounded-full overflow-hidden h-1.5 bg-slate-700 mb-3">
          <div className="bg-emerald-400 transition-all duration-700" style={{ width: `${liquidPct}%` }} />
          <div className="bg-indigo-400  transition-all duration-700" style={{ width: `${longTermPct}%` }} />
        </div>

        <div className="flex">
          <div className="flex-1">
            <p className="text-slate-500 text-xs">Liquid</p>
            <p className="text-emerald-400 font-bold text-sm mt-0.5">{formatCurrency(liquid)}</p>
          </div>
          <div className="flex-1">
            <p className="text-slate-500 text-xs">Long-term</p>
            <p className="text-indigo-400 font-bold text-sm mt-0.5">{formatCurrency(longTerm)}</p>
          </div>
          <div className="flex-1">
            <p className="text-slate-500 text-xs">Split</p>
            <p className="text-white font-bold text-sm mt-0.5">{liquidPct}% / {longTermPct}%</p>
          </div>
        </div>

        {/* Debt row */}
        {debt > 0 && (
          <div className="mt-4 flex items-center justify-between border-t border-slate-800 pt-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
              <p className="text-slate-400 text-xs">
                Credit card debt{debtPct > 0 ? ` · ${debtPct}% of assets` : ''}
              </p>
            </div>
            <span className="text-red-400 font-bold text-sm tabular-nums">
              -{formatCurrency(debt)}
            </span>
          </div>
        )}
      </div>

      {/* ── Decision Card ──────────────────────────────────── */}
      <div className={`rounded-2xl px-4 py-4 mb-6 ${decisionBg}`}>
        <div className="flex items-center gap-2 mb-2">
          <span className={`w-2 h-2 rounded-full shrink-0 ${decisionDot}`} />
          <p className="text-sm font-extrabold text-slate-900">{decisionLabel}</p>
        </div>
        <p className="text-sm text-slate-600 mb-1.5">{decisionDetail}</p>
        <p className="text-xs text-slate-400">{decisionAction}</p>
      </div>

      {/* ── Monthly Health ─────────────────────────────────── */}
      <SectionLabel title="This Month" />
      <div className="grid grid-cols-2 gap-3 mb-6">
        <MetricCard label="Income"      value={formatCurrency(income)}   accent="green"        sub="received" />
        <MetricCard label="Expenses"    value={formatCurrency(expenses)} accent="red"          sub="spent" />
        <MetricCard label="Net Saving"  value={formatCurrency(savings)}  accent={savingAccent} sub="income − expenses" />
        <MetricCard label="Saving Rate" value={`${savingRate}%`}         accent={rateAccent}   sub="of income" />
      </div>

      {/* ── Cash Allocation Insight ────────────────────────── */}
      <SectionLabel title="Cash Allocation" />
      <Card className="mb-6">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${ac.bg}`}>
            <ChartBarsIcon color={ac.icon} />
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-bold ${ac.text}`}>{allocStatus}</p>
            <p className="text-xs text-slate-400 mt-0.5 leading-snug">{allocDetail}</p>
          </div>
        </div>

        {hasBalances && (
          <div className="mt-4">
            <div className="flex rounded-full overflow-hidden h-2 bg-slate-100">
              <div className="bg-emerald-400 transition-all duration-700" style={{ width: `${liquidPct}%` }} />
              <div className="bg-indigo-400  transition-all duration-700" style={{ width: `${longTermPct}%` }} />
            </div>
            <div className="flex justify-between mt-2">
              <span className="text-xs text-slate-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                Liquid {liquidPct}%
              </span>
              <span className="text-xs text-slate-400 flex items-center gap-1.5">
                Long-term {longTermPct}%
                <span className="w-2 h-2 rounded-full bg-indigo-400 shrink-0" />
              </span>
            </div>
          </div>
        )}
      </Card>

      {/* ── Saving Goal ────────────────────────────────────── */}
      {goal && (
        <>
          <SectionLabel title="Saving Goal" />
          <Card className="mb-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-base font-bold text-slate-800 leading-tight">{goal.name}</p>
                <p className="text-xs text-slate-400 mt-1">
                  {formatCurrency(Number(goal.current_amount))} saved of {formatCurrency(Number(goal.target_amount))}
                </p>
              </div>
              <Badge
                label={
                  monthsToGoal === 0 ? '🎉 Done'
                  : monthsToGoal     ? `~${monthsToGoal} mo`
                  : 'No forecast'
                }
                variant={monthsToGoal === 0 ? 'green' : monthsToGoal ? 'indigo' : 'default'}
              />
            </div>

            {/* Progress bar */}
            <div className="w-full bg-slate-100 rounded-full h-2.5 mb-2">
              <div
                className="bg-indigo-500 h-2.5 rounded-full transition-all duration-700"
                style={{ width: `${Math.min(100, progressPct)}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-slate-400 mb-4">
              <span>{progressPct}% complete</span>
              <span>{formatCurrency(remaining)} remaining</span>
            </div>

            {estCompletion && monthsToGoal !== 0 && (
              <p className="text-xs text-slate-400 mb-3">
                Estimated completion:{' '}
                <span className="text-indigo-500 font-semibold">
                  {new Date(estCompletion).toLocaleString('default', { month: 'long', year: 'numeric' })}
                </span>
              </p>
            )}

            {/* Decision microcopy */}
            <div className={`rounded-xl px-3 py-2.5 ${goalBg}`}>
              <p className={`text-xs font-semibold ${goalTextCls}`}>{goalMessage}</p>
            </div>
          </Card>
        </>
      )}

      {/* ── Net Worth Trend ────────────────────────────────── */}
      <SectionLabel title="Net Worth Trend" sub="6-month history" />
      <Card className="mb-4">
        {nwChartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={nwChartData} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={fmtAxis} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={44} />
              <Tooltip formatter={v => [formatCurrency(v), 'Net Worth']} {...tooltipStyle} />
              <Line
                type="monotone"
                dataKey="netWorth"
                stroke="#6366f1"
                strokeWidth={2.5}
                dot={{ fill: '#6366f1', r: 3, strokeWidth: 0 }}
                activeDot={{ r: 5, strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <EmptyChart label="No balance data yet" />
        )}
      </Card>

      {/* ── Monthly Saving ─────────────────────────────────── */}
      <SectionLabel title="Monthly Saving" sub="Green = saved · Red = deficit" />
      <Card className="mb-6">
        {savingsChartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={savingsChartData} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={fmtAxis} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={44} />
              <Tooltip formatter={v => [formatCurrency(v), 'Saving']} {...tooltipStyle} />
              <Bar dataKey="saving" radius={[4, 4, 0, 0]} maxBarSize={40}>
                {savingsChartData.map((entry, i) => (
                  <Cell key={i} fill={entry.saving >= 0 ? '#10b981' : '#f87171'} fillOpacity={0.9} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyChart label="No transaction data yet" />
        )}
      </Card>

      {/* ── Trends ─────────────────────────────────────────── */}
      {(savingsTrend || nwChange !== null) && (
        <>
          <SectionLabel title="Trends" />
          <Card>
            <div className="space-y-4">

              {/* Savings trend */}
              {savingsTrend && (
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-400 mb-0.5">Savings (3-month trend)</p>
                    <p className="text-sm font-semibold text-slate-700 leading-snug">
                      {savingsTrend.direction === 'up'   && 'Your savings are improving'}
                      {savingsTrend.direction === 'down'  && `Your savings dropped ${Math.abs(savingsTrend.pct)}%`}
                      {savingsTrend.direction === 'flat'  && 'Your savings are steady'}
                    </p>
                  </div>
                  <span className={`text-2xl font-extrabold shrink-0 ${
                    savingsTrend.direction === 'up'   ? 'text-emerald-500'
                    : savingsTrend.direction === 'down' ? 'text-red-500'
                    : 'text-slate-300'
                  }`}>
                    {savingsTrend.direction === 'up'   ? `+${savingsTrend.pct}%` : null}
                    {savingsTrend.direction === 'down'  ? `${savingsTrend.pct}%`  : null}
                    {savingsTrend.direction === 'flat'  ? '—' : null}
                  </span>
                </div>
              )}

              {/* Net worth delta */}
              {nwChange !== null && (
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-400 mb-0.5">Net worth</p>
                    <p className="text-sm font-semibold text-slate-700">
                      {nwChange >= 0 ? 'Growing this month' : 'Declined this month'}
                    </p>
                  </div>
                  <span className={`text-2xl font-extrabold shrink-0 ${nwChange >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                    {nwChange >= 0 ? '+' : ''}{formatCurrency(nwChange)}
                  </span>
                </div>
              )}

              {/* Insight callout */}
              {trendInsight && (
                <div className={`rounded-xl px-3 py-2.5 text-xs font-semibold ${
                  savingsTrend?.direction === 'up'   ? 'bg-emerald-50 text-emerald-700'
                  : savingsTrend?.direction === 'down' ? 'bg-red-50 text-red-600'
                  : 'bg-slate-50 text-slate-500'
                }`}>
                  {trendInsight}
                </div>
              )}

            </div>
          </Card>
        </>
      )}

    </div>
  )
}

// ── Internal components ───────────────────────────────────────

function SectionLabel({ title, sub }) {
  return (
    <div className="flex items-baseline justify-between mb-2">
      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{title}</p>
      {sub && <p className="text-xs text-slate-300">{sub}</p>}
    </div>
  )
}

function EmptyChart({ label }) {
  return (
    <div className="h-36 flex items-center justify-center text-sm text-slate-300">
      {label}
    </div>
  )
}

function ChartBarsIcon({ color = '#64748b' }) {
  return (
    <svg width={18} height={18} fill="none" stroke={color} strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  )
}
