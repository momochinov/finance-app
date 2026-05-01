import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useUser } from '../hooks/useUser'
import PageHeader from '../components/PageHeader'
import Card from '../components/Card'

// ── Helpers ───────────────────────────────────────────────────
function fmt(n) {
  return '$' + Number(n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function fmtDate(dateStr) {
  if (!dateStr) return null
  const [y, m] = dateStr.split('-')
  return new Date(+y, +m - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

function futureMonth(months) {
  const d = new Date()
  d.setMonth(d.getMonth() + Math.ceil(months))
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

// ── Sub-components ────────────────────────────────────────────
function SectionLabel({ children }) {
  return (
    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{children}</p>
  )
}

function StatBox({ label, value, valueClass }) {
  return (
    <div className="bg-slate-50 rounded-xl p-3">
      <p className="text-xs text-slate-400 mb-0.5">{label}</p>
      <p className={`text-base font-extrabold ${valueClass ?? 'text-slate-900'}`}>{value}</p>
    </div>
  )
}

function StatusBar({ pct, colorClass }) {
  return (
    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
      <div
        className={`h-2 rounded-full transition-all duration-500 ${colorClass}`}
        style={{ width: `${Math.min(Math.max(Number(pct) || 0, 0), 100)}%` }}
      />
    </div>
  )
}

const STATUS_COLORS = {
  healthy: {
    text:  'text-emerald-600',
    badge: 'bg-emerald-50 text-emerald-700',
    bg:    'bg-emerald-50 text-emerald-700',
    bar:   'bg-emerald-500',
  },
  tight: {
    text:  'text-amber-600',
    badge: 'bg-amber-50 text-amber-700',
    bg:    'bg-amber-50 text-amber-700',
    bar:   'bg-amber-400',
  },
  unsafe: {
    text:  'text-red-500',
    badge: 'bg-red-50 text-red-600',
    bg:    'bg-red-50 text-red-600',
    bar:   'bg-red-500',
  },
}

const DEFAULT_PROP = {
  price:        '650000',
  depositPct:   '20',
  stampDuty:    '25000',
  buyingCosts:  '5000',
  bufferMonths: '6',
  monthlyExp:   '3000',
  grants:       '0',
}

export default function Goal() {
  const { user } = useUser()

  const [progress, setProgress]   = useState(null)
  const [netWorth, setNetWorth]   = useState(null)
  const [loading, setLoading]     = useState(true)
  const [showForm, setShowForm]   = useState(false)
  const [form, setForm]           = useState({ name: '', target: '', current: '' })
  const [saving, setSaving]       = useState(false)
  const [formErr, setFormErr]     = useState(null)
  const [prop, setProp]           = useState(DEFAULT_PROP)
  const [showAssume, setShowAssume] = useState(false)

  async function load() {
    if (!user) return
    setLoading(true)
    const [{ data: gData }, { data: nwData }] = await Promise.all([
      supabase.from('goal_progress').select('*').limit(1),
      supabase
        .from('net_worth_summary')
        .select('*')
        .order('month', { ascending: false })
        .limit(1),
    ])
    setProgress(gData?.[0] ?? null)
    setNetWorth(nwData?.[0] ?? null)
    setLoading(false)
  }

  useEffect(() => { load() }, [user?.id])

  function openForm() {
    setForm(
      progress
        ? { name: progress.name, target: String(progress.target_amount), current: String(progress.current_amount) }
        : { name: '', target: '', current: '' }
    )
    setFormErr(null)
    setShowForm(true)
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.name.trim() || Number(form.target) <= 0) {
      setFormErr('Enter a goal name and a target above 0')
      return
    }
    setSaving(true)
    setFormErr(null)
    const payload = {
      name:           form.name.trim(),
      target_amount:  Number(form.target),
      current_amount: Number(form.current) || 0,
    }
    const { error } = progress?.id
      ? await supabase.from('goals').update(payload).eq('id', progress.id)
      : await supabase.from('goals').insert({
          ...payload,
          user_id:    user.id,
          start_date: new Date().toISOString().slice(0, 10),
        })
    setSaving(false)
    if (error) { setFormErr(error.message); return }
    setShowForm(false)
    load()
  }

  // ── Cashflow ─────────────────────────────────────────────────
  const liquidPct    = netWorth ? Number(netWorth.liquid_pct) : null
  const liquidStatus = liquidPct === null ? null
    : liquidPct < 20 ? 'unsafe'
    : liquidPct < 40 ? 'tight'
    : 'healthy'
  const avgSaving    = Number(progress?.monthly_avg_saving ?? 0)
  const remaining    = Number(progress?.remaining_amount   ?? 0)
  const availForGoal = liquidStatus === 'unsafe'  ? 0
    : liquidStatus === 'tight'   ? avgSaving * 0.5
    : liquidStatus === 'healthy' ? avgSaving * 0.8
    : null
  const adjMonths    = availForGoal === null || availForGoal <= 0 || remaining <= 0
    ? null
    : Math.ceil(remaining / availForGoal)
  const adjCompletion = adjMonths === null ? null : futureMonth(adjMonths)
  const lc = STATUS_COLORS[liquidStatus ?? 'healthy']

  // ── Property readiness ────────────────────────────────────────
  const price          = Number(prop.price)        || 0
  const depPct         = Number(prop.depositPct)   || 20
  const stampDuty      = Number(prop.stampDuty)    || 0
  const buyingCosts    = Number(prop.buyingCosts)  || 0
  const bufMonths      = Number(prop.bufferMonths) || 0
  const monthlyExp     = Number(prop.monthlyExp)   || 0
  const grants         = Number(prop.grants)       || 0

  const depositRequired = price * depPct / 100
  const emergencyBuffer = bufMonths * monthlyExp
  const requiredCash    = depositRequired + stampDuty + buyingCosts + emergencyBuffer - grants
  const usableCash      = Number(netWorth?.liquid ?? 0)
  const shortfall       = requiredCash - usableCash
  const readinessPct    = requiredCash > 0 ? Math.min(usableCash / requiredCash * 100, 100) : 0

  const mthsUntilReady = shortfall <= 0 ? 0
    : (availForGoal ?? 0) > 0 ? Math.ceil(shortfall / (availForGoal ?? 1))
    : null
  const safeReadyDate = mthsUntilReady === null ? null
    : mthsUntilReady === 0 ? 'Now'
    : futureMonth(mthsUntilReady)

  const propStatus = shortfall <= 0 ? 'healthy'
    : usableCash < emergencyBuffer ? 'unsafe'
    : 'tight'
  const propDecisionMsg = shortfall <= 0
    ? 'You have enough cash including your emergency buffer.'
    : usableCash < emergencyBuffer
      ? 'Build your emergency buffer first before buying.'
      : `Deposit shortfall is ${fmt(shortfall)}.`
  const propDecisionLabel = shortfall <= 0 ? 'Ready'
    : usableCash < emergencyBuffer ? 'Not ready'
    : 'Not ready yet'
  const pc = STATUS_COLORS[propStatus]
  const propBarColor = readinessPct >= 100 ? 'bg-emerald-500'
    : readinessPct >= 60 ? 'bg-amber-400'
    : 'bg-red-500'

  // ── Goal display values ───────────────────────────────────────
  const progressPct = Math.min(Number(progress?.progress_pct ?? 0), 100)
  const rawMonths   = progress?.months_to_goal
  const monthsLabel = rawMonths === 0    ? '🎉 Reached'
    : rawMonths == null                  ? '—'
    : rawMonths > 120                    ? `≈ ${Math.round(rawMonths / 12)} years`
    : `${rawMonths} months`
  const completionLbl = fmtDate(progress?.estimated_completion_date)

  // human-readable cashflow pace (no calendar date)
  const adjPaceLabel = adjMonths === null
    ? 'Not enough safe cashflow to estimate'
    : adjMonths > 24
      ? `At this pace: ~${Math.round(adjMonths / 12)} years to goal`
      : `At this pace: ${adjMonths} months to goal`

  // top-of-page decision sentence (property readiness)
  const topDecision = !netWorth ? null
    : shortfall <= 0
      ? "You're ready to buy — with buffer."
      : usableCash < emergencyBuffer
        ? "You have enough deposit, but your cash buffer is too low."
        : `You're ${fmt(shortfall)} away from being property-ready.`

  // property status banner text
  const propBannerText = propStatus === 'healthy' ? 'Ready — safe to proceed'
    : propStatus === 'tight'   ? 'Close — but buffer is tight'
    : `Not ready — short ${fmt(shortfall)}`
  const propBannerClass = propStatus === 'healthy'
    ? 'bg-emerald-500 text-white'
    : propStatus === 'tight'
      ? 'bg-amber-400 text-white'
      : 'bg-red-500 text-white'

  return (
    <div className="px-4 pb-10">
      <div className="flex items-end justify-between">
        <PageHeader title="Goal" sub="Savings target & forecast" />
        {progress && (
          <button
            onClick={openForm}
            className="mb-4 text-xs font-semibold text-indigo-600 active:opacity-60"
          >
            Edit
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !progress ? (
        <Card className="text-center py-12 space-y-3">
          <p className="text-3xl">🎯</p>
          <p className="text-sm font-semibold text-slate-700">No savings goal yet</p>
          <p className="text-xs text-slate-400">Set a target to see your path to reaching it</p>
          <button
            onClick={openForm}
            className="mt-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold
              shadow-md shadow-indigo-200 active:scale-[0.97] transition-transform"
          >
            Create Goal
          </button>
        </Card>
      ) : (
        <div className="space-y-7">

          {/* ── Primary decision line ─────────────────────────────── */}
          {topDecision && (
            <p className="text-2xl font-extrabold text-slate-900 leading-snug tracking-tight">
              {topDecision}
            </p>
          )}

          {/* ── 1. Goal Overview ─────────────────────────────────── */}
          <div className="space-y-2.5">
            <SectionLabel>Goal Progress</SectionLabel>
            <Card className="space-y-5">
              <div>
                <p className="text-xs text-slate-400">Savings goal</p>
                <h2 className="text-xl font-extrabold text-slate-900 leading-tight mt-0.5">
                  {progress.name}
                </h2>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="font-bold text-slate-700">{fmt(progress.current_amount)}</span>
                  <span className="font-extrabold text-indigo-600">{progressPct}%</span>
                  <span className="font-bold text-slate-700">{fmt(progress.target_amount)}</span>
                </div>
                <StatusBar pct={progressPct} colorClass="bg-indigo-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <StatBox label="Remaining"          value={fmt(progress.remaining_amount)} />
                <StatBox label="Avg monthly saving"  value={fmt(avgSaving)} />
                <StatBox label="Time to goal"        value={monthsLabel} />
                {completionLbl && (
                  <StatBox label="Est. completion" value={completionLbl} />
                )}
              </div>

              {/* Safe vs Accelerated plan */}
              {remaining > 0 && avgSaving > 0 && (() => {
                const reqMonthly5yr = Math.ceil(remaining / 60)
                const gap5yr        = reqMonthly5yr - avgSaving
                return (
                  <div className="border-t border-slate-100 pt-4 space-y-2.5">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Plan comparison</p>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-500">Current pace</span>
                      <span className="font-bold text-slate-700">{fmt(avgSaving)}/mo → {monthsLabel}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-500">5-year plan</span>
                      <span className="font-bold text-indigo-600">{fmt(reqMonthly5yr)}/mo</span>
                    </div>
                    {gap5yr > 0 ? (
                      <div className={`rounded-xl px-3 py-2 text-xs ${gap5yr > avgSaving ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700'}`}>
                        Save {fmt(gap5yr)}/mo more to reach goal in 5 years
                      </div>
                    ) : (
                      <div className="rounded-xl px-3 py-2 text-xs bg-emerald-50 text-emerald-700">
                        Already on pace to reach the goal in under 5 years
                      </div>
                    )}
                  </div>
                )
              })()}
            </Card>
          </div>

          {/* ── 2. Available Cashflow ─────────────────────────────── */}
          {liquidStatus && (
            <div className="space-y-2.5">
              <SectionLabel>Available Cashflow</SectionLabel>
              <Card className="space-y-4">
                <div className="flex items-start justify-between">
                  <p className="text-sm font-extrabold text-slate-900">Goal Allocation</p>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full capitalize ${lc.badge}`}>
                    {liquidStatus}
                  </span>
                </div>

                {/* Prose primary numbers */}
                <div className="space-y-1">
                  <p className={`text-xl font-extrabold ${lc.text}`}>
                    You can safely save {fmt(availForGoal ?? 0)}/month
                  </p>
                  <p className="text-sm text-slate-500">{adjPaceLabel}</p>
                </div>

                {/* Secondary stat */}
                <div className="flex justify-between items-center text-xs border-t border-slate-100 pt-3">
                  <span className="text-slate-400">Avg monthly saving (all income)</span>
                  <span className="font-semibold text-slate-600">{fmt(avgSaving)}/mo</span>
                </div>

                <div className={`rounded-xl px-4 py-3 text-xs leading-relaxed ${lc.bg}`}>
                  {liquidStatus === 'healthy' && 'Your liquidity is healthy. You can allocate more confidently.'}
                  {liquidStatus === 'tight'   && 'Liquidity is tight. Maintain buffer before increasing contributions.'}
                  {liquidStatus === 'unsafe'  && 'Build emergency buffer before allocating more to this goal.'}
                </div>
              </Card>
            </div>
          )}

          {/* ── 3. Property Readiness ─────────────────────────────── */}
          {netWorth && (
            <div className="space-y-2.5">
              <SectionLabel>Property Readiness</SectionLabel>
              <Card className="space-y-5">

                {/* Status banner */}
                <div className={`rounded-xl px-4 py-3 text-sm font-bold ${propBannerClass}`}>
                  {propBannerText}
                </div>

                {/* Readiness bar */}
                <div>
                  <div className="flex justify-between text-sm font-bold mb-2">
                    <span className="text-indigo-600">{fmt(usableCash)}</span>
                    <span className="text-slate-500 font-normal text-xs self-center">
                      {Math.round(readinessPct)}% of required cash
                    </span>
                    <span className="text-slate-700">{fmt(requiredCash)}</span>
                  </div>
                  <StatusBar pct={readinessPct} colorClass={propBarColor} />
                  <div className="flex justify-between mt-1 text-xs text-slate-400">
                    <span>liquid cash</span>
                    <span>total needed</span>
                  </div>
                </div>

                {/* Breakdown */}
                <div className="space-y-2 text-xs">
                  {[
                    { label: 'Deposit required',  val: fmt(depositRequired) },
                    { label: 'Stamp duty',         val: fmt(stampDuty) },
                    { label: 'Buying costs',       val: fmt(buyingCosts) },
                    { label: 'Emergency buffer',   val: fmt(emergencyBuffer) },
                    ...(grants > 0
                      ? [{ label: 'Grants / FHSS', val: `−${fmt(grants)}`, credit: true }]
                      : []),
                  ].map(({ label, val, credit }) => (
                    <div key={label} className="flex justify-between items-center">
                      <span className="text-slate-400">{label}</span>
                      <span className={`font-semibold ${credit ? 'text-emerald-600' : 'text-slate-600'}`}>
                        {val}
                      </span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center border-t border-slate-100 pt-2">
                    <span className="font-semibold text-slate-700">Total required</span>
                    <span className="font-extrabold text-slate-900">{fmt(requiredCash)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-slate-700">Usable liquid cash</span>
                    <span className="font-extrabold text-indigo-600">{fmt(usableCash)}</span>
                  </div>
                  {shortfall > 0 && (
                    <div className="flex justify-between items-center border-t border-slate-100 pt-2">
                      <span className="font-semibold text-red-500">Shortfall</span>
                      <span className="font-extrabold text-red-500">{fmt(shortfall)}</span>
                    </div>
                  )}
                </div>

                {/* 3yr / 5yr savings plan */}
                {shortfall > 0 && (
                  <div className="space-y-2 border-t border-slate-100 pt-4">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      Savings plan to close gap
                    </p>
                    {[
                      { label: '3-year plan', months: 36 },
                      { label: '5-year plan', months: 60 },
                    ].map(({ label, months }) => (
                      <div key={months} className="flex justify-between items-center text-sm">
                        <span className="text-slate-500">{label}</span>
                        <span className="font-bold text-slate-800">{fmt(Math.ceil(shortfall / months))}/mo</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Actionable plan */}
                {shortfall > 0 && availForGoal !== null && (
                  <div className="space-y-2 border-t border-slate-100 pt-4">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      To close the gap faster
                    </p>
                    {[500, 1000].map(extra => {
                      const total  = (availForGoal ?? 0) + extra
                      const months = total > 0 ? Math.ceil(shortfall / total) : null
                      const time   = months === null ? '—'
                        : months > 24 ? `~${Math.round(months / 12)} years`
                        : `${months} months`
                      return (
                        <div key={extra} className="flex justify-between items-center text-sm">
                          <span className="text-slate-500">
                            + save {fmt(extra)}/mo more
                          </span>
                          <span className="font-bold text-slate-800">ready in {time}</span>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Ready / safe-date callout */}
                {shortfall <= 0 ? (
                  <div className="bg-emerald-50 text-emerald-700 rounded-xl px-4 py-3 text-xs font-semibold">
                    You could act now — you have enough cash including buffer.
                  </div>
                ) : mthsUntilReady !== null ? (
                  <div className={`rounded-xl px-4 py-3 text-xs leading-relaxed ${pc.bg}`}>
                    At current cashflow pace, property-ready by{' '}
                    <span className="font-bold">{safeReadyDate}</span>.
                  </div>
                ) : (
                  <div className="bg-slate-50 text-slate-500 rounded-xl px-4 py-3 text-xs">
                    Not enough safe cashflow to project a ready date.
                  </div>
                )}

                {/* Assumptions toggle */}
                <button
                  onClick={() => setShowAssume(v => !v)}
                  className="text-xs font-semibold text-indigo-600 flex items-center gap-1 active:opacity-60"
                >
                  {showAssume ? '▲ Hide' : '▼ Edit'} assumptions
                </button>

                {showAssume && (
                  <div className="grid grid-cols-2 gap-3 pt-1 border-t border-slate-100">
                    {([
                      { label: 'Property price',  key: 'price',        full: true,  suffix: null, prefix: '$' },
                      { label: 'Deposit %',        key: 'depositPct',   full: false, suffix: '%',  prefix: null },
                      { label: 'Stamp duty',       key: 'stampDuty',    full: false, suffix: null, prefix: '$' },
                      { label: 'Buying costs',     key: 'buyingCosts',  full: false, suffix: null, prefix: '$' },
                      { label: 'Buffer months',    key: 'bufferMonths', full: false, suffix: 'mo', prefix: null },
                      { label: 'Monthly expenses', key: 'monthlyExp',   full: false, suffix: null, prefix: '$' },
                      { label: 'Grants / FHSS',    key: 'grants',       full: false, suffix: null, prefix: '$' },
                    ]).map(({ label, key, full, suffix, prefix }) => (
                      <div key={key} className={full ? 'col-span-2' : ''}>
                        <label className="text-xs text-slate-400 block mb-1">{label}</label>
                        <div className="relative">
                          {prefix && (
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">
                              {prefix}
                            </span>
                          )}
                          <input
                            type="text"
                            inputMode="decimal"
                            value={prop[key]}
                            onChange={e =>
                              setProp(p => ({ ...p, [key]: e.target.value.replace(/[^0-9.]/g, '') }))
                            }
                            className={`w-full py-2 rounded-lg border border-slate-200 bg-white
                              text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500
                              ${prefix ? 'pl-6' : 'pl-3'} ${suffix ? 'pr-7' : 'pr-3'}`}
                          />
                          {suffix && (
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">
                              {suffix}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          )}

        </div>
      )}

      {/* ── Goal form sheet ───────────────────────────────────────── */}
      {showForm && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setShowForm(false)} />
          <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md
            bg-white rounded-t-2xl z-50 px-5 pt-5 pb-10 shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-bold text-slate-900">
                {progress ? 'Edit Goal' : 'Create Goal'}
              </h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 text-lg active:opacity-60">
                ✕
              </button>
            </div>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Goal name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Property deposit"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white
                    text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              {[
                { label: 'Target amount',   key: 'target',  placeholder: '100,000' },
                { label: 'Current savings', key: 'current', placeholder: '0' },
              ].map(({ label, key, placeholder }) => (
                <div key={key} className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-semibold">$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={form[key]}
                      onChange={e => setForm(f => ({ ...f, [key]: e.target.value.replace(/[^0-9.]/g, '') }))}
                      placeholder={placeholder}
                      className="w-full pl-8 pr-4 py-3 rounded-xl border border-slate-200 bg-white
                        text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              ))}
              {formErr && <p className="text-sm text-red-500">{formErr}</p>}
              <button
                type="submit"
                disabled={saving}
                className="w-full py-3.5 rounded-xl bg-indigo-600 text-white font-bold text-sm
                  disabled:opacity-60 shadow-md shadow-indigo-200 active:scale-[0.98] transition-all"
              >
                {saving ? 'Saving…' : progress ? 'Update Goal' : 'Create Goal'}
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  )
}
