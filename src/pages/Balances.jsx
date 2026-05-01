import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useUser } from '../hooks/useUser'
import PageHeader from '../components/PageHeader'
import Card from '../components/Card'
import MetricCard from '../components/MetricCard'

const CURRENT_MONTH = new Date().toISOString().slice(0, 7)

// Flat list of all account types — drives both the form selector and display labels.
// credit_card is always stored with a negative balance (debt).
const ACCOUNT_TYPE_META = [
  { value: 'saving',       label: 'Savings Account', liquidity: 'liquid',    isDebt: false },
  { value: 'cash',         label: 'Cash',             liquidity: 'liquid',    isDebt: false },
  { value: 'term_deposit', label: 'Term Deposit',     liquidity: 'long_term', isDebt: false },
  { value: 'investment',   label: 'Investment',       liquidity: 'long_term', isDebt: false },
  { value: 'credit_card',  label: 'Credit Card',      liquidity: 'liquid',    isDebt: true  },
]

const ACCOUNT_TYPE_LABEL = Object.fromEntries(ACCOUNT_TYPE_META.map(t => [t.value, t.label]))
const LIQUIDITY_LABEL    = { liquid: 'Liquid', long_term: 'Long-term' }

function fmt(n) {
  return '$' + Math.abs(Number(n)).toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function isDebtAccount(accountType) {
  return accountType === 'credit_card'
}

export default function Balances() {
  const { user } = useUser()
  const [accounts, setAccounts] = useState([])
  const [summary,  setSummary]  = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [isEdit,   setIsEdit]   = useState(false)
  const [form, setForm] = useState({
    account: '', balance: '', account_type: 'saving',
  })
  const [saving,  setSaving]  = useState(false)
  const [formErr, setFormErr] = useState(null)

  async function load() {
    if (!user) return
    setLoading(true)
    const [{ data: accs }, { data: sumRows }] = await Promise.all([
      supabase.from('balances').select('*').eq('month', CURRENT_MONTH).order('account'),
      supabase.from('net_worth_summary').select('*').eq('month', CURRENT_MONTH).limit(1),
    ])
    setAccounts(accs ?? [])
    setSummary(sumRows?.[0] ?? null)
    setLoading(false)
  }

  useEffect(() => { load() }, [user?.id])

  function openAdd() {
    setIsEdit(false)
    setForm({ account: '', balance: '', account_type: 'saving' })
    setFormErr(null)
    setShowForm(true)
  }

  function openEdit(acc) {
    setIsEdit(true)
    setForm({
      account:      acc.account,
      balance:      String(Math.abs(Number(acc.balance))), // always show positive
      account_type: acc.account_type,
    })
    setFormErr(null)
    setShowForm(true)
  }

  async function handleSave(e) {
    e.preventDefault()
    const amt = Number(form.balance)
    if (!form.account.trim() || !amt || amt <= 0) {
      setFormErr('Enter an account name and an amount above 0'); return
    }
    setSaving(true); setFormErr(null)

    const meta = ACCOUNT_TYPE_META.find(t => t.value === form.account_type)
    const signedBalance = meta.isDebt ? -amt : amt

    const { error } = await supabase.from('balances').upsert(
      {
        user_id:       user.id,
        month:         CURRENT_MONTH,
        account:       form.account.trim(),
        liquidity_type: meta.liquidity,
        account_type:  form.account_type,
        balance:       signedBalance,
      },
      { onConflict: 'user_id,month,account' }
    )
    setSaving(false)
    if (error) { setFormErr(error.message); return }
    setShowForm(false)
    load()
  }

  // ── Derived summary values ─────────────────────────────────
  const netWorth    = summary ? Number(summary.net_worth)    : null
  const assetsTotal = summary ? Number(summary.assets_total) : null
  const debt        = summary ? Number(summary.debt)         : null
  const liquid      = summary ? Number(summary.liquid)       : null
  const liquidPct   = summary ? Number(summary.liquid_pct)   : null
  const debtPct     = summary ? Number(summary.debt_pct)     : null

  const liquidAccent = liquidPct === null ? 'default'
    : liquidPct < 20 ? 'red'
    : liquidPct < 40 ? 'amber'
    : 'green'
  const liquidSub = liquidPct === null ? undefined
    : liquidPct < 20 ? 'Low — build buffer'
    : liquidPct < 40 ? 'Adequate'
    : 'Healthy'

  const debtAccent = debtPct === null || debtPct === 0 ? 'default'
    : debtPct > 20 ? 'red'
    : 'amber'

  // ── Split accounts into assets and liabilities ─────────────
  const assets      = accounts.filter(a => Number(a.balance) > 0)
  const liabilities = accounts.filter(a => Number(a.balance) < 0)

  // ── Form meta shortcut ─────────────────────────────────────
  const formMeta  = ACCOUNT_TYPE_META.find(t => t.value === form.account_type)
  const formIsDebt = formMeta?.isDebt ?? false

  return (
    <div className="px-4 pb-6">
      <div className="flex items-end justify-between">
        <PageHeader title="Assets" sub={CURRENT_MONTH} />
        <button onClick={openAdd} className="mb-4 text-xs font-semibold text-indigo-600 active:opacity-60">
          + Add
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* ── Summary cards ──────────────────────────────────── */}
          {summary && (
            <div className="grid grid-cols-2 gap-3 mb-5">
              <MetricCard
                label="Net Worth"
                value={fmt(netWorth)}
                accent={netWorth !== null && netWorth < 0 ? 'red' : 'indigo'}
              />
              <MetricCard label="Liquid"  value={fmt(liquid)}      accent={liquidAccent} sub={liquidSub} />
              <MetricCard label="Assets"  value={fmt(assetsTotal)} accent="default" />
              <MetricCard
                label="Debt"
                value={debt ? `-${fmt(debt)}` : '$0'}
                accent={debtAccent}
                sub={debtPct ? `${debtPct}% of assets` : undefined}
              />
            </div>
          )}

          {accounts.length === 0 ? (
            <Card className="text-center py-12 space-y-3">
              <p className="text-2xl">💰</p>
              <p className="text-sm font-semibold text-slate-700">No balances for this month</p>
              <p className="text-xs text-slate-400">Add accounts and liabilities to track net worth</p>
              <button
                onClick={openAdd}
                className="mt-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold
                  shadow-md shadow-indigo-200 active:scale-[0.97] transition-transform"
              >
                Add Account
              </button>
            </Card>
          ) : (
            <div className="space-y-5">
              {/* Assets */}
              {assets.length > 0 && (
                <div className="space-y-2.5">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Assets</p>
                  {assets.map(acc => (
                    <Card key={acc.id}>
                      <button className="w-full text-left" onClick={() => openEdit(acc)}>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-semibold text-slate-800">{acc.account}</p>
                            <p className="text-xs text-slate-400 mt-0.5">
                              {LIQUIDITY_LABEL[acc.liquidity_type]} · {ACCOUNT_TYPE_LABEL[acc.account_type]}
                            </p>
                          </div>
                          <span className="text-base font-extrabold text-slate-900">{fmt(acc.balance)}</span>
                        </div>
                      </button>
                    </Card>
                  ))}
                </div>
              )}

              {/* Liabilities */}
              {liabilities.length > 0 && (
                <div className="space-y-2.5">
                  <p className="text-xs font-bold text-red-400 uppercase tracking-wider">Liabilities</p>
                  {liabilities.map(acc => (
                    <Card key={acc.id}>
                      <button className="w-full text-left" onClick={() => openEdit(acc)}>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-semibold text-slate-800">{acc.account}</p>
                            <p className="text-xs text-red-400 mt-0.5">
                              {ACCOUNT_TYPE_LABEL[acc.account_type]} · debt
                            </p>
                          </div>
                          <div className="text-right">
                            <span className="text-base font-extrabold text-red-500">
                              -{fmt(acc.balance)}
                            </span>
                            <p className="text-xs text-red-400">owed</p>
                          </div>
                        </div>
                      </button>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Add / Edit form sheet ──────────────────────────────── */}
      {showForm && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setShowForm(false)} />
          <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md
            bg-white rounded-t-2xl z-50 px-5 pt-5 pb-10 shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-bold text-slate-900">
                {isEdit ? 'Edit Account' : 'Add Account'}
              </h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 text-lg active:opacity-60">✕</button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              {/* Account name */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Account name</label>
                <input
                  type="text"
                  value={form.account}
                  onChange={e => setForm(f => ({ ...f, account: e.target.value }))}
                  placeholder="e.g. Savings Account"
                  disabled={isEdit}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white
                    text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500
                    disabled:opacity-50"
                />
              </div>

              {/* Account type — single selector, drives liquidity automatically */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Account type</label>
                <select
                  value={form.account_type}
                  onChange={e => setForm(f => ({ ...f, account_type: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white
                    text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <optgroup label="Assets">
                    {ACCOUNT_TYPE_META.filter(t => !t.isDebt).map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Liabilities">
                    {ACCOUNT_TYPE_META.filter(t => t.isDebt).map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </optgroup>
                </select>
                {!formIsDebt && (
                  <p className="text-xs text-slate-400">
                    Type: {formMeta?.liquidity === 'liquid' ? 'Liquid (accessible)' : 'Long-term (locked-in)'}
                  </p>
                )}
                {formIsDebt && (
                  <p className="text-xs text-red-400 font-semibold">
                    Debt — will be stored as a negative balance and deducted from net worth
                  </p>
                )}
              </div>

              {/* Balance / Amount owed */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  {formIsDebt ? 'Amount owed' : 'Balance'}
                </label>
                <div className="relative">
                  <span className={`absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold
                    ${formIsDebt ? 'text-red-400' : 'text-slate-400'}`}>
                    $
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={form.balance}
                    onChange={e => setForm(f => ({ ...f, balance: e.target.value.replace(/[^0-9.]/g, '') }))}
                    placeholder="0"
                    className={`w-full pl-8 pr-4 py-3 rounded-xl border bg-white text-sm
                      focus:outline-none focus:ring-2
                      ${formIsDebt
                        ? 'border-red-200 text-red-600 focus:ring-red-400'
                        : 'border-slate-200 text-slate-900 focus:ring-indigo-500'}`}
                  />
                </div>
              </div>

              {formErr && <p className="text-sm text-red-500">{formErr}</p>}

              <button
                type="submit"
                disabled={saving}
                className={`w-full py-3.5 rounded-xl text-white font-bold text-sm
                  disabled:opacity-60 shadow-md active:scale-[0.98] transition-all
                  ${formIsDebt
                    ? 'bg-red-500 shadow-red-200'
                    : 'bg-indigo-600 shadow-indigo-200'}`}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  )
}
