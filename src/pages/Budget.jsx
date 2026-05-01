import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useUser } from '../hooks/useUser'
import PageHeader from '../components/PageHeader'
import Card from '../components/Card'

const BUDGET_CATEGORIES = [
  'Rent', 'Groceries', 'Dining Out', 'Transport',
  'Utilities', 'Health', 'Entertainment', 'Shopping', 'Education',
]

const FLEXIBLE  = new Set(['Dining Out', 'Entertainment', 'Shopping'])
const CURRENT_MONTH = new Date().toISOString().slice(0, 7)

function fmt(n) {
  return '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function usageColors(pct) {
  if (pct > 100) return { bar: 'bg-red-500',     badge: 'bg-red-50 text-red-500' }
  if (pct >= 80)  return { bar: 'bg-amber-400',   badge: 'bg-amber-50 text-amber-600' }
  return             { bar: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-600' }
}

function BudgetBar({ pct }) {
  const { bar } = usageColors(pct)
  return (
    <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
      <div
        className={`h-1.5 rounded-full transition-all duration-500 ${bar}`}
        style={{ width: `${Math.min(pct, 100)}%` }}
      />
    </div>
  )
}

export default function Budget() {
  const { user } = useUser()
  const [rows, setRows]             = useState([])
  const [goalData, setGoalData]     = useState(null)
  const [loading, setLoading]       = useState(true)
  const [showForm, setShowForm]     = useState(false)
  const [formCat, setFormCat]       = useState(BUDGET_CATEGORIES[0])
  const [formAmt, setFormAmt]       = useState('')
  const [saving, setSaving]         = useState(false)
  const [formErr, setFormErr]       = useState(null)

  async function load() {
    if (!user) return
    setLoading(true)
    const [{ data: budgetData }, { data: goalRows }] = await Promise.all([
      supabase.from('budget_actuals').select('*').eq('month', CURRENT_MONTH).order('category'),
      supabase.from('goal_progress').select('*').limit(1),
    ])
    setRows(budgetData ?? [])
    setGoalData(goalRows?.[0] ?? null)
    setLoading(false)
  }

  useEffect(() => { load() }, [user?.id])

  function openForm(row = null) {
    setFormCat(row ? row.category : BUDGET_CATEGORIES[0])
    setFormAmt(row ? String(row.budget) : '')
    setFormErr(null)
    setShowForm(true)
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!formAmt || Number(formAmt) <= 0) { setFormErr('Enter a budget amount above 0'); return }
    setSaving(true); setFormErr(null)
    const { error } = await supabase.from('budgets').upsert(
      { user_id: user.id, month: CURRENT_MONTH, category: formCat, budget: Number(formAmt) },
      { onConflict: 'user_id,month,category' }
    )
    setSaving(false)
    if (error) { setFormErr(error.message); return }
    setShowForm(false)
    load()
  }

  // ── Insight calculations ─────────────────────────────────────
  const overspent = [...rows]
    .filter(r => Number(r.usage_percent) > 100)
    .sort((a, b) => Number(b.usage_percent) - Number(a.usage_percent))
    .slice(0, 2)

  const flexRows      = rows.filter(r => FLEXIBLE.has(r.category))
  const flexActual    = flexRows.reduce((s, r) => s + Number(r.actual), 0)
  const topFlex       = [...flexRows].sort((a, b) => Number(b.actual) - Number(a.actual))[0]
  const cut20         = topFlex ? Math.round(Number(topFlex.actual) * 0.2) : 0

  const avgSaving  = goalData ? Number(goalData.monthly_avg_saving) : 0
  const remaining  = goalData ? Number(goalData.remaining_amount)   : 0
  let timelineSaved = null
  if (cut20 > 0 && avgSaving > 0 && remaining > 0) {
    const saved = remaining / avgSaving - remaining / (avgSaving + cut20)
    timelineSaved = saved >= 24 ? `~${Math.round(saved / 12)} years`
      : saved >= 1  ? `~${Math.round(saved)} months`
      : null
  }

  const hasInsights = rows.length > 0 && (overspent.length > 0 || flexActual > 0)

  return (
    <div className="px-4 pb-6">
      <div className="flex items-end justify-between">
        <PageHeader title="Budget" sub={CURRENT_MONTH} />
        <button onClick={() => openForm()} className="mb-4 text-xs font-semibold text-indigo-600 active:opacity-60">
          + Add
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <Card className="text-center py-12 space-y-3">
          <p className="text-2xl">📊</p>
          <p className="text-sm font-semibold text-slate-700">No budget set for this month</p>
          <p className="text-xs text-slate-400">Add categories to track your spending</p>
          <button
            onClick={() => openForm()}
            className="mt-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold
              shadow-md shadow-indigo-200 active:scale-[0.97] transition-transform"
          >
            Set Budget
          </button>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map(row => {
            const pct    = Number(row.usage_percent)
            const colors = usageColors(pct)
            return (
              <Card key={row.id}>
                <button className="w-full text-left" onClick={() => openForm(row)}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-slate-800">{row.category}</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${colors.badge}`}>
                      {row.status === 'over' ? 'Over budget' : `${pct}%`}
                    </span>
                  </div>
                  <BudgetBar pct={pct} />
                  <div className="flex justify-between mt-2 text-xs text-slate-400">
                    <span>{fmt(row.actual)} spent</span>
                    <span>of {fmt(row.budget)}</span>
                  </div>
                </button>
              </Card>
            )
          })}
        </div>
      )}

      {/* ── Spending Insights ─────────────────────────────────── */}
      {hasInsights && (
        <div className="mt-7 space-y-3">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Spending Insights
          </p>

          {/* Overspending alert */}
          {overspent.length > 0 && (
            <Card className="space-y-2.5">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                <p className="text-xs font-semibold text-red-500 uppercase tracking-wide">
                  Overspending
                </p>
              </div>
              {overspent.map(r => {
                const over = Math.round(Number(r.usage_percent) - 100)
                return (
                  <div key={r.id} className="flex items-start justify-between gap-3">
                    <p className="text-sm text-slate-700">
                      You're overspending on{' '}
                      <span className="font-bold">{r.category}</span>
                    </p>
                    <span className="shrink-0 text-xs font-extrabold text-red-500 bg-red-50
                      px-2 py-0.5 rounded-full">
                      +{over}%
                    </span>
                  </div>
                )
              })}
            </Card>
          )}

          {/* Flexible spend */}
          {flexActual > 0 && (
            <Card className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide">
                  Flexible spending
                </p>
              </div>
              <p className="text-sm text-slate-700">
                You spent{' '}
                <span className="font-bold">{fmt(flexActual)}</span>{' '}
                on Dining, Entertainment &amp; Shopping this month.
              </p>
              <p className="text-xs text-slate-400">
                These are your most cuttable categories if you need to save faster.
              </p>
            </Card>
          )}

          {/* Cutting opportunity */}
          {topFlex && cut20 > 0 && (
            <Card className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide">
                  Saving opportunity
                </p>
              </div>
              <p className="text-sm text-slate-700">
                Cutting{' '}
                <span className="font-bold">{topFlex.category}</span>{' '}
                by 20% saves{' '}
                <span className="font-bold text-emerald-600">{fmt(cut20)}/month</span>.
              </p>
              {timelineSaved && (
                <p className="text-sm text-slate-500">
                  This reduces your goal timeline by{' '}
                  <span className="font-semibold text-slate-700">{timelineSaved}</span>.
                </p>
              )}
            </Card>
          )}
        </div>
      )}

      {showForm && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setShowForm(false)} />
          <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md
            bg-white rounded-t-2xl z-50 px-5 pt-5 pb-10 shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-bold text-slate-900">Set Budget</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 text-lg active:opacity-60">✕</button>
            </div>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Category</label>
                <select
                  value={formCat}
                  onChange={e => setFormCat(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white
                    text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {BUDGET_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Monthly budget</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-semibold">$</span>
                  <input
                    type="text" inputMode="decimal"
                    value={formAmt}
                    onChange={e => setFormAmt(e.target.value.replace(/[^0-9.]/g, ''))}
                    placeholder="0"
                    className="w-full pl-8 pr-4 py-3 rounded-xl border border-slate-200 bg-white
                      text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
              {formErr && <p className="text-sm text-red-500">{formErr}</p>}
              <button
                type="submit" disabled={saving}
                className="w-full py-3.5 rounded-xl bg-indigo-600 text-white font-bold text-sm
                  disabled:opacity-60 shadow-md shadow-indigo-200 active:scale-[0.98] transition-all"
              >
                {saving ? 'Saving…' : 'Save Budget'}
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  )
}
