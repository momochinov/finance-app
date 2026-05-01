import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useUser } from '../hooks/useUser'
import PageHeader from '../components/PageHeader'
import Card from '../components/Card'
import MetricCard from '../components/MetricCard'

const CURRENT_MONTH = new Date().toISOString().slice(0, 7)

const ACCOUNT_TYPES = {
  liquid:    ['saving', 'cash'],
  long_term: ['term_deposit', 'investment'],
}
const ACCOUNT_TYPE_LABELS = {
  saving: 'Savings', cash: 'Cash',
  term_deposit: 'Term Deposit', investment: 'Investment',
}
const LIQUIDITY_LABELS = { liquid: 'Liquid', long_term: 'Long-term' }

function fmt(n) {
  return '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })
}

export default function Balances() {
  const { user } = useUser()
  const [accounts, setAccounts] = useState([])
  const [summary, setSummary]   = useState(null)
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [isEdit, setIsEdit]     = useState(false)
  const [form, setForm] = useState({
    account: '', balance: '', liquidity_type: 'liquid', account_type: 'saving',
  })
  const [saving, setSaving]   = useState(false)
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
    setForm({ account: '', balance: '', liquidity_type: 'liquid', account_type: 'saving' })
    setFormErr(null)
    setShowForm(true)
  }

  function openEdit(acc) {
    setIsEdit(true)
    setForm({
      account:       acc.account,
      balance:       String(acc.balance),
      liquidity_type: acc.liquidity_type,
      account_type:  acc.account_type,
    })
    setFormErr(null)
    setShowForm(true)
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.account.trim() || Number(form.balance) < 0) {
      setFormErr('Enter an account name and valid balance'); return
    }
    setSaving(true); setFormErr(null)
    const { error } = await supabase.from('balances').upsert(
      {
        user_id:       user.id,
        month:         CURRENT_MONTH,
        account:       form.account.trim(),
        liquidity_type: form.liquidity_type,
        account_type:  form.account_type,
        balance:       Number(form.balance),
      },
      { onConflict: 'user_id,month,account' }
    )
    setSaving(false)
    if (error) { setFormErr(error.message); return }
    setShowForm(false)
    load()
  }

  const liquidPct = summary ? Number(summary.liquid_pct) : null
  const liquidAccent = liquidPct === null ? 'default'
    : liquidPct < 20 ? 'red'
    : liquidPct < 40 ? 'amber'
    : 'green'
  const liquidSub = liquidPct === null ? undefined
    : liquidPct < 20 ? 'Low — build buffer'
    : liquidPct < 40 ? 'Adequate'
    : 'Healthy'

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
          {summary && (
            <div className="grid grid-cols-2 gap-3 mb-5">
              <MetricCard label="Net Worth" value={fmt(summary.net_worth)} accent="indigo" />
              <MetricCard label="Liquid"    value={fmt(summary.liquid)}    accent="green" />
              <MetricCard label="Long-term" value={fmt(summary.long_term)} accent="default" />
              <MetricCard
                label="Liquidity"
                value={`${liquidPct ?? 0}%`}
                accent={liquidAccent}
                sub={liquidSub}
              />
            </div>
          )}

          {accounts.length === 0 ? (
            <Card className="text-center py-12 space-y-3">
              <p className="text-2xl">💰</p>
              <p className="text-sm font-semibold text-slate-700">No balances for this month</p>
              <p className="text-xs text-slate-400">Add account snapshots to track your net worth</p>
              <button
                onClick={openAdd}
                className="mt-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold
                  shadow-md shadow-indigo-200 active:scale-[0.97] transition-transform"
              >
                Add Balance
              </button>
            </Card>
          ) : (
            <div className="space-y-3">
              {accounts.map(acc => (
                <Card key={acc.id}>
                  <button className="w-full text-left" onClick={() => openEdit(acc)}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{acc.account}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {LIQUIDITY_LABELS[acc.liquidity_type]} · {ACCOUNT_TYPE_LABELS[acc.account_type]}
                        </p>
                      </div>
                      <span className="text-base font-extrabold text-slate-900">{fmt(acc.balance)}</span>
                    </div>
                  </button>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {showForm && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setShowForm(false)} />
          <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md
            bg-white rounded-t-2xl z-50 px-5 pt-5 pb-10 shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-bold text-slate-900">{isEdit ? 'Edit Balance' : 'Add Balance'}</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 text-lg active:opacity-60">✕</button>
            </div>
            <form onSubmit={handleSave} className="space-y-4">
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
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Liquidity</label>
                  <select
                    value={form.liquidity_type}
                    onChange={e => {
                      const lt = e.target.value
                      setForm(f => ({ ...f, liquidity_type: lt, account_type: ACCOUNT_TYPES[lt][0] }))
                    }}
                    className="w-full px-3 py-3 rounded-xl border border-slate-200 bg-white
                      text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="liquid">Liquid</option>
                    <option value="long_term">Long-term</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Type</label>
                  <select
                    value={form.account_type}
                    onChange={e => setForm(f => ({ ...f, account_type: e.target.value }))}
                    className="w-full px-3 py-3 rounded-xl border border-slate-200 bg-white
                      text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {ACCOUNT_TYPES[form.liquidity_type].map(at => (
                      <option key={at} value={at}>{ACCOUNT_TYPE_LABELS[at]}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Balance</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-semibold">$</span>
                  <input
                    type="text" inputMode="decimal"
                    value={form.balance}
                    onChange={e => setForm(f => ({ ...f, balance: e.target.value.replace(/[^0-9.]/g, '') }))}
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
                {saving ? 'Saving…' : 'Save Balance'}
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  )
}
