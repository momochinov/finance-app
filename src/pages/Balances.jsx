import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useUser } from '../hooks/useUser'
import PageHeader from '../components/PageHeader'
import Card from '../components/Card'
import MetricCard from '../components/MetricCard'

const CURRENT_MONTH = new Date().toISOString().slice(0, 7)

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

function PencilIcon() {
  return (
    <svg width={15} height={15} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M15.232 5.232l3.536 3.536M9 13l6.293-6.293a1 1 0 011.414 0l1.586 1.586a1 1 0 010 1.414L12 16H9v-3z" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width={15} height={15} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M4 7h16M10 3h4a1 1 0 011 1v3H9V4a1 1 0 011-1z" />
    </svg>
  )
}

const EMPTY_FORM = { account: '', balance: '', account_type: 'saving' }

export default function Balances() {
  const { user } = useUser()

  const [accounts,     setAccounts]     = useState([])
  const [summary,      setSummary]      = useState(null)
  const [loading,      setLoading]      = useState(true)

  // form sheet
  const [showForm,     setShowForm]     = useState(false)
  const [editingAcc,   setEditingAcc]   = useState(null)  // null = add, object = edit
  const [form,         setForm]         = useState(EMPTY_FORM)
  const [saving,       setSaving]       = useState(false)
  const [formErr,      setFormErr]      = useState(null)

  // confirm modal
  const [confirmModal, setConfirmModal] = useState(null)  // { type: 'delete'|'payoff', acc }
  const [confirmBusy,  setConfirmBusy]  = useState(false)
  const [confirmErr,   setConfirmErr]   = useState(null)

  // ── Fetch ───────────────────────────────────────────────────
  async function fetchBalances() {
    if (!user) return
    setLoading(true)
    const [{ data: accs, error: e1 }, { data: sumRows, error: e2 }] = await Promise.all([
      supabase
        .from('balances')
        .select('*')
        .eq('user_id', user.id)
        .eq('month', CURRENT_MONTH)
        .order('account'),
      supabase
        .from('net_worth_summary')
        .select('*')
        .eq('user_id', user.id)
        .eq('month', CURRENT_MONTH)
        .limit(1),
    ])
    if (e1) console.error('balances fetch:', e1.message)
    if (e2) console.error('summary fetch:', e2.message)
    setAccounts(accs ?? [])
    setSummary(sumRows?.[0] ?? null)
    setLoading(false)
  }

  useEffect(() => { fetchBalances() }, [user?.id])

  // ── Open add ────────────────────────────────────────────────
  function openAdd() {
    setEditingAcc(null)
    setForm(EMPTY_FORM)
    setFormErr(null)
    setShowForm(true)
  }

  // ── Open edit — prefill form with existing account values ──
  function openEdit(acc) {
    setEditingAcc(acc)
    setForm({
      account:      acc.account,
      balance:      String(Math.abs(Number(acc.balance))),
      account_type: acc.account_type,
    })
    setFormErr(null)
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingAcc(null)
    setFormErr(null)
  }

  // ── Save — update if editing, insert if new ────────────────
  async function handleSave(e) {
    e.preventDefault()
    const amt = parseFloat(form.balance)
    if (!form.account.trim() || !amt || amt <= 0) {
      setFormErr('Enter an account name and a positive amount')
      return
    }

    setSaving(true)
    setFormErr(null)

    const meta          = ACCOUNT_TYPE_META.find(t => t.value === form.account_type)
    const signedBalance = meta.isDebt ? -Math.abs(amt) : Math.abs(amt)

    let error

    if (editingAcc) {
      // Update existing row — match by id AND user_id for safety
      const { error: updateErr } = await supabase
        .from('balances')
        .update({
          account_type:   form.account_type,
          liquidity_type: meta.liquidity,
          balance:        signedBalance,
        })
        .eq('id',      editingAcc.id)
        .eq('user_id', user.id)

      error = updateErr
    } else {
      // Insert new row (upsert on name+month collision)
      const { error: upsertErr } = await supabase
        .from('balances')
        .upsert(
          {
            user_id:        user.id,
            month:          CURRENT_MONTH,
            account:        form.account.trim(),
            account_type:   form.account_type,
            liquidity_type: meta.liquidity,
            balance:        signedBalance,
          },
          { onConflict: 'user_id,month,account' }
        )

      error = upsertErr
    }

    setSaving(false)

    if (error) {
      setFormErr(error.message)
      return
    }

    closeForm()
    fetchBalances()
  }

  // ── Delete / pay-off confirm ────────────────────────────────
  function openDelete(acc) {
    setConfirmErr(null)
    setConfirmModal({ type: 'delete', acc })
  }

  function openPayoff(acc) {
    setConfirmErr(null)
    setConfirmModal({ type: 'payoff', acc })
  }

  async function handleConfirm() {
    if (!confirmModal) return
    setConfirmBusy(true)
    setConfirmErr(null)

    const { error } = await supabase
      .from('balances')
      .delete()
      .eq('id',      confirmModal.acc.id)
      .eq('user_id', user.id)

    setConfirmBusy(false)

    if (error) {
      setConfirmErr(error.message)
      return
    }

    setConfirmModal(null)
    fetchBalances()
  }

  // ── Derived values ──────────────────────────────────────────
  const netWorth    = summary ? Number(summary.net_worth)    : null
  const assetsTotal = summary ? Number(summary.assets_total) : null
  const debt        = summary ? Number(summary.debt)         : null
  const liquid      = summary ? Number(summary.liquid)       : null
  const liquidPct   = summary ? Number(summary.liquid_pct)   : null
  const debtPct     = summary ? Number(summary.debt_pct)     : null

  const liquidAccent = liquidPct === null ? 'default'
    : liquidPct < 20 ? 'red' : liquidPct < 40 ? 'amber' : 'green'
  const liquidSub = liquidPct === null ? undefined
    : liquidPct < 20 ? 'Low — build buffer' : liquidPct < 40 ? 'Adequate' : 'Healthy'
  const debtAccent = !debtPct ? 'default' : debtPct > 20 ? 'red' : 'amber'

  const assets      = accounts.filter(a => Number(a.balance) > 0)
  const liabilities = accounts.filter(a => Number(a.balance) < 0)

  const formMeta   = ACCOUNT_TYPE_META.find(t => t.value === form.account_type)
  const formIsDebt = formMeta?.isDebt ?? false

  // ── Render ──────────────────────────────────────────────────
  return (
    <div className="px-4 pb-6">
      <div className="flex items-end justify-between">
        <PageHeader title="Assets" sub={CURRENT_MONTH} />
        <button
          onClick={openAdd}
          className="mb-4 text-xs font-semibold text-indigo-600 active:opacity-60"
        >
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

              {assets.length > 0 && (
                <section className="space-y-2.5">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Assets</p>
                  {assets.map(acc => (
                    <Card key={acc.id}>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-800 truncate">{acc.account}</p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {LIQUIDITY_LABEL[acc.liquidity_type]} · {ACCOUNT_TYPE_LABEL[acc.account_type]}
                          </p>
                        </div>
                        <span className="text-base font-extrabold text-slate-900 tabular-nums">
                          {fmt(acc.balance)}
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => openEdit(acc)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg
                              text-slate-400 hover:text-indigo-600 hover:bg-indigo-50
                              active:opacity-60 transition-colors"
                            aria-label={`Edit ${acc.account}`}
                          >
                            <PencilIcon />
                          </button>
                          <button
                            type="button"
                            onClick={() => openDelete(acc)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg
                              text-slate-300 hover:text-red-500 hover:bg-red-50
                              active:opacity-60 transition-colors"
                            aria-label={`Delete ${acc.account}`}
                          >
                            <TrashIcon />
                          </button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </section>
              )}

              {liabilities.length > 0 && (
                <section className="space-y-2.5">
                  <p className="text-xs font-bold text-red-400 uppercase tracking-wider">Liabilities</p>
                  {liabilities.map(acc => (
                    <Card key={acc.id}>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-800 truncate">{acc.account}</p>
                          <p className="text-xs text-red-400 mt-0.5">
                            {ACCOUNT_TYPE_LABEL[acc.account_type]} · Debt
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-base font-extrabold text-red-500 tabular-nums">
                            -{fmt(acc.balance)}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => openEdit(acc)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg
                              text-slate-400 hover:text-indigo-600 hover:bg-indigo-50
                              active:opacity-60 transition-colors"
                            aria-label={`Edit ${acc.account}`}
                          >
                            <PencilIcon />
                          </button>
                          <button
                            type="button"
                            onClick={() => openDelete(acc)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg
                              text-slate-300 hover:text-red-500 hover:bg-red-50
                              active:opacity-60 transition-colors"
                            aria-label={`Delete ${acc.account}`}
                          >
                            <TrashIcon />
                          </button>
                        </div>
                      </div>

                      {acc.account_type === 'credit_card' && (
                        <div className="mt-3 pt-3 border-t border-slate-100">
                          <button
                            type="button"
                            onClick={() => openPayoff(acc)}
                            className="w-full py-2 rounded-xl bg-emerald-500 text-white text-xs font-bold
                              shadow-sm shadow-emerald-200 active:scale-[0.98] transition-all"
                          >
                            Mark as paid off
                          </button>
                        </div>
                      )}
                    </Card>
                  ))}
                </section>
              )}

            </div>
          )}
        </>
      )}

      {/* ── Add / Edit form sheet ──────────────────────────── */}
      {showForm && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={closeForm} />
          <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md
            bg-white rounded-t-2xl z-50 px-5 pt-5 pb-10 shadow-xl">

            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-bold text-slate-900">
                {editingAcc ? `Edit — ${editingAcc.account}` : 'Add Account'}
              </h2>
              <button
                type="button"
                onClick={closeForm}
                className="text-slate-400 text-lg active:opacity-60"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Account name
                </label>
                <input
                  type="text"
                  value={form.account}
                  onChange={e => setForm(f => ({ ...f, account: e.target.value }))}
                  placeholder="e.g. ING Savings"
                  disabled={!!editingAcc}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white
                    text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500
                    disabled:opacity-50 disabled:bg-slate-50"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Account type
                </label>
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
                <p className={`text-xs font-semibold ${formIsDebt ? 'text-red-400' : 'text-slate-400'}`}>
                  {formIsDebt
                    ? 'Debt — deducted from net worth'
                    : formMeta?.liquidity === 'liquid' ? 'Liquid (accessible)' : 'Long-term (locked-in)'}
                </p>
              </div>

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

              {formErr && (
                <p className="text-sm text-red-500 bg-red-50 rounded-xl px-3 py-2">{formErr}</p>
              )}

              <button
                type="submit"
                disabled={saving}
                className={`w-full py-3.5 rounded-xl text-white font-bold text-sm
                  disabled:opacity-60 shadow-md active:scale-[0.98] transition-all
                  ${formIsDebt ? 'bg-red-500 shadow-red-200' : 'bg-indigo-600 shadow-indigo-200'}`}
              >
                {saving ? 'Saving…' : editingAcc ? 'Update' : 'Save'}
              </button>
            </form>
          </div>
        </>
      )}

      {/* ── Confirm modal (delete / pay off) ──────────────── */}
      {confirmModal && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-40"
            onClick={() => { if (!confirmBusy) setConfirmModal(null) }}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center px-6 pointer-events-none">
            <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6 pointer-events-auto">
              <p className="text-base font-bold text-slate-900 mb-1">
                {confirmModal.type === 'payoff' ? 'Mark as paid off?' : 'Delete account?'}
              </p>
              <p className="text-sm text-slate-500 mb-5">
                {confirmModal.type === 'payoff'
                  ? `"${confirmModal.acc.account}" will be removed from your liabilities. Net worth will update immediately.`
                  : `"${confirmModal.acc.account}" will be permanently removed from this month.`}
              </p>

              {confirmErr && (
                <p className="text-sm text-red-500 bg-red-50 rounded-xl px-3 py-2 mb-3">{confirmErr}</p>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmModal(null)}
                  disabled={confirmBusy}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold
                    text-slate-600 active:opacity-60 disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={confirmBusy}
                  className={`flex-1 py-2.5 rounded-xl text-white text-sm font-bold
                    active:scale-[0.98] transition-all disabled:opacity-60
                    ${confirmModal.type === 'payoff'
                      ? 'bg-emerald-500 shadow-sm shadow-emerald-200'
                      : 'bg-red-500 shadow-sm shadow-red-200'}`}
                >
                  {confirmBusy
                    ? 'Please wait…'
                    : confirmModal.type === 'payoff' ? 'Mark paid off' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
