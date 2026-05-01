import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useUser } from '../hooks/useUser'

const TOTAL_STEPS = 5

const BUDGET_CATEGORIES = [
  'Rent', 'Groceries', 'Dining Out', 'Transport',
  'Utilities', 'Health', 'Entertainment', 'Shopping', 'Education',
]

const BALANCE_ACCOUNTS = [
  { key: 'savings',      label: 'Savings Account', kind: 'liquid',    subkind: 'saving' },
  { key: 'cash',         label: 'Cash',             kind: 'liquid',    subkind: 'cash' },
  { key: 'term_deposit', label: 'Term Deposit',     kind: 'long_term', subkind: 'term_deposit' },
  { key: 'investments',  label: 'Investments',      kind: 'long_term', subkind: 'investment' },
]

function ProgressBar({ step }) {
  return (
    <div className="fixed top-0 left-0 right-0 z-50 h-1 bg-slate-100 max-w-md mx-auto">
      <div
        className="h-full bg-indigo-500 transition-all duration-500 ease-out"
        style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
      />
    </div>
  )
}

function StepDots({ step }) {
  return (
    <div className="flex gap-1.5 justify-center">
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
        <span
          key={i}
          className={`w-1.5 h-1.5 rounded-full transition-all duration-300
            ${i < step ? 'bg-indigo-500' : 'bg-slate-200'}`}
        />
      ))}
    </div>
  )
}

function AmountInput({ label, value, onChange, placeholder = '0' }) {
  function handleChange(e) {
    const raw = e.target.value.replace(/[^0-9.]/g, '')
    onChange(raw)
  }
  function formatDisplay(raw) {
    if (!raw) return ''
    const parts = raw.split('.')
    const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    return parts.length > 1 ? `${intPart}.${parts[1]}` : intPart
  }
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</label>
      <div className="relative">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-semibold">$</span>
        <input
          type="text"
          inputMode="decimal"
          value={formatDisplay(value)}
          onChange={handleChange}
          placeholder={placeholder}
          className="w-full pl-8 pr-4 py-3 rounded-xl border border-slate-200 bg-white
            text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500
            focus:border-transparent transition-shadow"
        />
      </div>
    </div>
  )
}

// Step 1 — Welcome
function StepWelcome() {
  return (
    <div className="flex flex-col items-center text-center gap-5 pt-8">
      <div className="w-20 h-20 rounded-3xl bg-indigo-600 text-white flex items-center
        justify-center shadow-lg shadow-indigo-200 text-4xl">
        👋
      </div>
      <div>
        <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Welcome to Finance</h2>
        <p className="text-sm text-slate-500 mt-2 max-w-xs mx-auto leading-relaxed">
          Let's take 2 minutes to set up your financial picture. You can always update this later.
        </p>
      </div>
      <div className="w-full space-y-2.5 mt-2">
        {[
          ['🎯', 'Set a savings goal'],
          ['📊', 'Build a monthly budget'],
          ['💰', 'Track your balances'],
        ].map(([icon, text]) => (
          <div key={text} className="flex items-center gap-3 bg-white rounded-xl px-4 py-3
            border border-slate-100 text-sm text-slate-700 font-medium">
            <span className="text-xl">{icon}</span>
            {text}
          </div>
        ))}
      </div>
    </div>
  )
}

// Step 2 — Goal
function StepGoal({ goal, setGoal }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">Set your savings goal</h2>
        <p className="text-sm text-slate-500 mt-1">What are you saving towards?</p>
      </div>
      <div className="space-y-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Goal name</label>
          <input
            type="text"
            value={goal.name}
            onChange={e => setGoal(g => ({ ...g, name: e.target.value }))}
            placeholder="e.g. Emergency fund, New car…"
            className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white
              text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500
              focus:border-transparent transition-shadow"
          />
        </div>
        <AmountInput
          label="Target amount"
          value={goal.target}
          onChange={v => setGoal(g => ({ ...g, target: v }))}
          placeholder="10,000"
        />
        <AmountInput
          label="Current savings (optional)"
          value={goal.current}
          onChange={v => setGoal(g => ({ ...g, current: v }))}
          placeholder="0"
        />
      </div>
    </div>
  )
}

// Step 3 — Budget
function StepBudget({ budgets, setBudgets }) {
  function handleChange(cat, val) {
    setBudgets(b => ({ ...b, [cat]: val.replace(/[^0-9.]/g, '') }))
  }
  function formatDisplay(raw) {
    if (!raw) return ''
    const parts = raw.split('.')
    const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    return parts.length > 1 ? `${intPart}.${parts[1]}` : intPart
  }
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">Monthly budget</h2>
        <p className="text-sm text-slate-500 mt-1">Set limits for each category. Skip any you don't need.</p>
      </div>
      <div className="space-y-3">
        {BUDGET_CATEGORIES.map(cat => (
          <div key={cat} className="flex items-center gap-3 bg-white rounded-xl px-4 py-3
            border border-slate-100">
            <span className="text-sm font-medium text-slate-700 flex-1">{cat}</span>
            <div className="relative w-28">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
              <input
                type="text"
                inputMode="decimal"
                value={formatDisplay(budgets[cat] || '')}
                onChange={e => handleChange(cat, e.target.value)}
                placeholder="—"
                className="w-full pl-7 pr-2 py-1.5 rounded-lg border border-slate-200 bg-slate-50
                  text-slate-900 text-sm text-right focus:outline-none focus:ring-2
                  focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Step 4 — Balances
function StepBalances({ balances, setBalances }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">Your balances</h2>
        <p className="text-sm text-slate-500 mt-1">Add your account balances. Skip any you don't have.</p>
      </div>
      <div className="space-y-3">
        {BALANCE_ACCOUNTS.map(acc => (
          <div key={acc.key} className="bg-white rounded-xl px-4 py-3 border border-slate-100 space-y-2">
            <span className="text-sm font-semibold text-slate-700">{acc.label}</span>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-semibold">$</span>
              <input
                type="text"
                inputMode="decimal"
                value={balances[acc.key] || ''}
                onChange={e => setBalances(b => ({
                  ...b,
                  [acc.key]: e.target.value.replace(/[^0-9.]/g, ''),
                }))}
                placeholder="0"
                className="w-full pl-8 pr-4 py-2 rounded-lg border border-slate-200 bg-slate-50
                  text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500
                  focus:border-transparent"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Step 5 — Finish
function StepFinish() {
  return (
    <div className="flex flex-col items-center text-center gap-5 pt-8">
      <div className="w-20 h-20 rounded-3xl bg-emerald-500 text-white flex items-center
        justify-center shadow-lg shadow-emerald-200 text-4xl">
        🎉
      </div>
      <div>
        <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">You're all set!</h2>
        <p className="text-sm text-slate-500 mt-2 max-w-xs mx-auto leading-relaxed">
          Your financial dashboard is ready. Start logging transactions to see your progress.
        </p>
      </div>
    </div>
  )
}

export default function Onboarding({ onComplete }) {
  const { user } = useUser()
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const [goal, setGoal] = useState({ name: '', target: '', current: '' })
  const [budgets, setBudgets] = useState({})
  const [balances, setBalances] = useState({})

  async function saveGoal() {
    if (!user) throw new Error('Not signed in')
    const { error } = await supabase.from('goals').insert({
      user_id:        user.id,
      name:           goal.name || 'My Goal',
      target_amount:  Number(goal.target)  || 0,
      current_amount: Number(goal.current) || 0,
      start_date:     new Date().toISOString().slice(0, 10),
    })
    if (error) throw error
  }

  async function saveBudgets() {
    if (!user) throw new Error('Not signed in')
    const month = new Date().toISOString().slice(0, 7)
    const rows = BUDGET_CATEGORIES
      .filter(cat => budgets[cat] && Number(budgets[cat]) > 0)
      .map(cat => ({
        user_id:  user.id,
        month,
        category: cat,
        budget:   Number(budgets[cat]),
      }))
    if (rows.length === 0) return
    const { error } = await supabase.from('budgets').insert(rows)
    if (error) throw error
  }

  async function saveBalances() {
    if (!user) throw new Error('Not signed in')
    const month = new Date().toISOString().slice(0, 7)
    const rows = BALANCE_ACCOUNTS
      .filter(acc => balances[acc.key] && Number(balances[acc.key]) > 0)
      .map(acc => ({
        user_id:       user.id,
        month,
        account:       acc.label,
        liquidity_type: acc.kind,
        account_type:  acc.subkind,
        balance:       Number(balances[acc.key]),
      }))
    if (rows.length === 0) return
    const { error } = await supabase.from('balances').insert(rows)
    if (error) throw error
  }

  async function handleNext() {
    setError(null)
    setSaving(true)
    try {
      if (step === 2) await saveGoal()
      if (step === 3) await saveBudgets()
      if (step === 4) await saveBalances()
      if (step === TOTAL_STEPS) {
        onComplete()
        return
      }
      setStep(s => s + 1)
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  function handleBack() {
    if (step > 1) setStep(s => s - 1)
  }

  const canSkipToNext = step === 3 || step === 4 // budget + balances are optional

  return (
    <div className="min-h-svh bg-slate-50 max-w-md mx-auto flex flex-col">
      <ProgressBar step={step} />

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-5 pt-10 pb-36">
        <StepDots step={step} />
        <div className="mt-6">
          {step === 1 && <StepWelcome />}
          {step === 2 && <StepGoal goal={goal} setGoal={setGoal} />}
          {step === 3 && <StepBudget budgets={budgets} setBudgets={setBudgets} />}
          {step === 4 && <StepBalances balances={balances} setBalances={setBalances} />}
          {step === 5 && <StepFinish />}
        </div>
        {error && (
          <p className="mt-4 text-sm text-red-500 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
            {error}
          </p>
        )}
      </div>

      {/* Fixed bottom nav */}
      <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto">
        {/* Gradient fade */}
        <div className="h-6 bg-gradient-to-t from-slate-50 to-transparent pointer-events-none" />
        <div className="bg-slate-50 px-5 pb-8 pt-2 flex gap-3">
          {step > 1 && (
            <button
              onClick={handleBack}
              disabled={saving}
              className="flex-none px-5 py-3.5 rounded-xl border border-slate-200 text-slate-600
                font-semibold text-sm active:scale-[0.97] transition-transform"
            >
              Back
            </button>
          )}
          <button
            onClick={handleNext}
            disabled={saving}
            className="flex-1 py-3.5 rounded-xl bg-indigo-600 text-white font-bold text-sm
              active:scale-[0.98] transition-all duration-150
              disabled:opacity-60 shadow-md shadow-indigo-200"
          >
            {saving
              ? 'Saving…'
              : step === TOTAL_STEPS
                ? 'Go to Dashboard'
                : canSkipToNext
                  ? 'Next (or skip)'
                  : 'Next'
            }
          </button>
        </div>
      </div>
    </div>
  )
}
