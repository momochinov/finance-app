import { useCallback, useEffect, memo, useMemo, useRef, useState } from 'react'
import { useUser }         from '../hooks/useUser'
import { useTransactions } from '../hooks/useTransactions'
import { formatCurrency }  from '../lib/finance'
import Card    from '../components/Card'
import Spinner from '../components/Spinner'

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────
const CATEGORIES = {
  income:  ['Salary', 'Freelance', 'Bonus', 'Investment', 'Gift', 'Other'],
  expense: ['Rent', 'Groceries', 'Transport', 'Dining Out', 'Entertainment',
            'Utilities', 'Health', 'Shopping', 'Education', 'Other'],
}

const DISCRETIONARY = new Set(['Dining Out', 'Entertainment', 'Shopping', 'Education'])

function todayISO() {
  return new Date().toISOString().split('T')[0]
}

const EMPTY_FORM = () => ({
  date:     todayISO(),
  type:     'expense',
  category: '',
  amount:   '',
  note:     '',
})

// ─────────────────────────────────────────────────────────────
// Date helpers
// ─────────────────────────────────────────────────────────────
function dateLabel(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date       = new Date(y, m - 1, d)
  const now        = new Date()
  const today      = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday  = new Date(today); yesterday.setDate(today.getDate() - 1)

  if (date.getTime() === today.getTime())     return 'Today'
  if (date.getTime() === yesterday.getTime()) return 'Yesterday'
  return date.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
}

function shortDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

// ─────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────
export default function Transactions() {
  const { user, loading: authLoading } = useUser()
  const { transactions, loading, error, addTransaction, updateTransaction, deleteTransaction } = useTransactions()

  const [filter,        setFilter]       = useState('all')
  const [showForm,      setShowForm]     = useState(false)
  const [editingTxn,    setEditingTxn]   = useState(null)   // null = add, object = edit
  const [form,          setForm]         = useState(EMPTY_FORM)
  const [errors,        setErrors]       = useState({})
  const [submitting,    setSubmitting]   = useState(false)
  const [submitError,   setSubmitError]  = useState(null)
  const [lastCategory,  setLastCategory] = useState('')
  const [toast,         setToast]        = useState(null)   // { message, onUndo }

  // Quick-add strip
  const [quickType,       setQuickType]       = useState('expense')
  const [quickAmount,     setQuickAmount]     = useState('')
  const [quickSubmitting, setQuickSubmitting] = useState(false)
  const [quickError,      setQuickError]      = useState(null)

  const toastTimerRef       = useRef(null)
  const pendingCommitRef    = useRef(null)
  const justAddedTimerRef   = useRef(null)
  // Always holds the latest deleteTransaction so handleDelete can be stable
  const deleteTransactionRef = useRef(deleteTransaction)
  useEffect(() => { deleteTransactionRef.current = deleteTransaction })

  const [justAdded, setJustAdded] = useState(false)

  // Lock body scroll while form is open
  useEffect(() => {
    document.body.style.overflow = showForm ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [showForm])

  // Commit any pending server delete on unmount
  useEffect(() => {
    return () => {
      clearTimeout(toastTimerRef.current)
      clearTimeout(justAddedTimerRef.current)
      pendingCommitRef.current?.()
    }
  }, [])

  // ── form helpers ───────────────────────────────────────────
  function setField(key, value) {
    setForm(prev => ({ ...prev, [key]: value }))
    if (errors[key]) setErrors(prev => ({ ...prev, [key]: null }))
  }

  function handleTypeChange(type) {
    setForm(prev => ({ ...prev, type, category: '' }))
    setErrors({})
  }

  function openAdd() {
    setEditingTxn(null)
    setForm(EMPTY_FORM())
    setErrors({})
    setSubmitError(null)
    setShowForm(true)
  }

  const openEdit = useCallback((txn) => {
    setEditingTxn(txn)
    setForm({
      date:     txn.date,
      type:     Number(txn.amount) > 0 ? 'income' : 'expense',
      category: txn.category,
      amount:   String(Math.abs(Number(txn.amount))),
      note:     txn.note ?? '',
    })
    setErrors({})
    setSubmitError(null)
    setShowForm(true)
  }, [])

  function closeForm() {
    setShowForm(false)
    setErrors({})
    setSubmitError(null)
    setEditingTxn(null)
    setForm(EMPTY_FORM())
  }

  function validate() {
    const errs = {}
    if (!form.category)                           errs.category = 'Pick a category'
    if (!form.amount || Number(form.amount) <= 0) errs.amount   = 'Enter an amount above 0'
    return errs
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }

    setSubmitting(true)
    setSubmitError(null)
    try {
      const signed = form.type === 'expense'
        ? -Math.abs(Number(form.amount))
        :  Math.abs(Number(form.amount))

      const payload = {
        date:     form.date,
        type:     form.type,
        category: form.category,
        amount:   signed,
        note:     form.note.trim() || null,
      }

      if (editingTxn) {
        await updateTransaction(editingTxn.id, payload)
      } else {
        await addTransaction({ ...payload, user_id: user.id })
        setLastCategory(form.category)
      }
      closeForm()
    } catch (err) {
      setSubmitError(err?.message ?? 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  // ── delete with undo toast ─────────────────────────────────
  // useCallback with [] is safe: all mutable values accessed via refs or stable setters
  const handleDelete = useCallback((id) => {
    if (pendingCommitRef.current) {
      clearTimeout(toastTimerRef.current)
      pendingCommitRef.current()
      pendingCommitRef.current = null
    }

    const { undo, commit } = deleteTransactionRef.current(id)
    pendingCommitRef.current = commit

    setToast({
      message: 'Transaction deleted',
      onUndo: () => {
        clearTimeout(toastTimerRef.current)
        undo()
        pendingCommitRef.current = null
        setToast(null)
      },
    })

    toastTimerRef.current = setTimeout(() => {
      commit()
      pendingCommitRef.current = null
      setToast(null)
    }, 5000)
  }, [])

  // ── quick-add ──────────────────────────────────────────────
  async function handleQuickAdd(e) {
    e.preventDefault()
    if (!lastCategory) { openAdd(); return }
    if (!quickAmount || Number(quickAmount) <= 0) {
      setQuickError('Enter an amount')
      return
    }
    setQuickSubmitting(true)
    setQuickError(null)
    try {
      const signed = quickType === 'expense'
        ? -Math.abs(Number(quickAmount))
        :  Math.abs(Number(quickAmount))
      await addTransaction({
        user_id:  user.id,
        date:     todayISO(),
        type:     quickType,
        category: lastCategory,
        amount:   signed,
        note:     null,
      })
      setQuickAmount('')
      setJustAdded(true)
      clearTimeout(justAddedTimerRef.current)
      justAddedTimerRef.current = setTimeout(() => setJustAdded(false), 1500)
    } catch (err) {
      setQuickError(err?.message ?? 'Failed to add')
    } finally {
      setQuickSubmitting(false)
    }
  }

  // ── derived data ───────────────────────────────────────────
  const filtered = useMemo(() => {
    if (filter === 'income')  return transactions.filter(t => Number(t.amount) > 0)
    if (filter === 'expense') return transactions.filter(t => Number(t.amount) < 0)
    return transactions
  }, [transactions, filter])

  const grouped = useMemo(() => {
    const map = {}
    filtered.forEach(t => { ;(map[t.date] ??= []).push(t) })
    return Object.entries(map).sort(([a], [b]) => b.localeCompare(a))
  }, [filtered])

  const totals = useMemo(() => {
    const inc = filtered.filter(t => Number(t.amount) > 0).reduce((s, t) => s + Number(t.amount), 0)
    const exp = filtered.filter(t => Number(t.amount) < 0).reduce((s, t) => s + Math.abs(Number(t.amount)), 0)
    return { income: inc, expenses: exp, net: inc - exp }
  }, [filtered])

  // Discretionary pct over all expenses (not affected by filter)
  const discretionaryPct = useMemo(() => {
    const allExpenses = transactions.filter(t => Number(t.amount) < 0)
    const totalExp    = allExpenses.reduce((s, t) => s + Math.abs(Number(t.amount)), 0)
    if (totalExp === 0) return null
    const discExp = allExpenses
      .filter(t => DISCRETIONARY.has(t.category))
      .reduce((s, t) => s + Math.abs(Number(t.amount)), 0)
    const pct = Math.round((discExp / totalExp) * 100)
    return pct > 0 ? pct : null
  }, [transactions])

  // Per-category expense breakdown for behaviour feedback
  const catBreakdown = useMemo(() => {
    const allExpenses = transactions.filter(t => Number(t.amount) < 0)
    const totalExp    = allExpenses.reduce((s, t) => s + Math.abs(Number(t.amount)), 0)
    if (totalExp === 0) return null
    const map = {}
    allExpenses.forEach(t => { map[t.category] = (map[t.category] ?? 0) + Math.abs(Number(t.amount)) })
    return { totalExp, map }
  }, [transactions])

  // ── render ─────────────────────────────────────────────────
  if (authLoading || loading) return <Spinner />

  if (error) return (
    <p className="px-4 pt-10 text-center text-sm text-red-500">{error}</p>
  )

  if (!user) return (
    <div className="px-4 pb-6">
      <p className="pt-10 text-center text-sm text-slate-400">Sign in to manage your transactions.</p>
    </div>
  )

  return (
    <>
      <div className="px-4 pb-6">

        {/* Header row */}
        <div className="flex items-center justify-between pt-8 pb-2">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Transactions</h1>
            <p className="text-sm text-slate-400 mt-0.5">
              {filtered.length} record{filtered.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={openAdd}
            className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-sm transition-colors active:scale-95"
          >
            <PlusIcon /> Add
          </button>
        </div>

        {/* Summary strip */}
        <div className="grid grid-cols-3 gap-2 mt-4 mb-4">
          <SummaryPill label="Income"   value={formatCurrency(totals.income)}   color="emerald" />
          <SummaryPill label="Expenses" value={formatCurrency(totals.expenses)} color="red"     />
          <SummaryPill
            label="Net"
            value={formatCurrency(totals.net)}
            color={totals.net >= 0 ? 'indigo' : 'red'}
          />
        </div>

        {/* Filter tabs */}
        <div className="flex bg-slate-100 rounded-xl p-1 gap-1 mb-4">
          {['all', 'income', 'expense'].map(key => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg capitalize transition-all ${
                filter === key
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {key}
            </button>
          ))}
        </div>

        {/* Quick-add strip */}
        {user && (
          <QuickAddStrip
            quickType={quickType}
            quickAmount={quickAmount}
            quickError={quickError}
            quickSubmitting={quickSubmitting}
            justAdded={justAdded}
            lastCategory={lastCategory}
            onTypeChange={t => { setQuickType(t); setQuickError(null) }}
            onAmountChange={v => { setQuickAmount(v); setQuickError(null) }}
            onSubmit={handleQuickAdd}
            onOpenFull={openAdd}
          />
        )}

        {/* Behaviour feedback */}
        {(discretionaryPct !== null || catBreakdown) && (
          <BehaviourFeedback discretionaryPct={discretionaryPct} catBreakdown={catBreakdown} />
        )}

        {/* Transaction list */}
        {grouped.length === 0 ? (
          <Card className="text-center py-12 flex flex-col items-center gap-3 mt-4">
            <span className="text-3xl text-slate-200">{filter === 'all' ? '💸' : filter === 'income' ? '💰' : '🧾'}</span>
            <p className="text-sm font-semibold text-slate-500">
              {filter === 'all'
                ? 'No transactions yet'
                : filter === 'income'
                  ? 'No income recorded'
                  : 'No expenses recorded'}
            </p>
            <p className="text-xs text-slate-400 max-w-[180px]">
              {filter === 'all'
                ? 'Start tracking your money by adding your first transaction.'
                : `Switch to All or add a new ${filter}.`}
            </p>
            {filter === 'all' && (
              <button onClick={openAdd} className="text-sm text-indigo-500 font-semibold mt-1">
                Add transaction →
              </button>
            )}
          </Card>
        ) : (
          <div className="flex flex-col gap-1 mt-3">
            {grouped.map(([date, txns]) => (
              <div key={date}>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide px-1 pt-4 pb-2">
                  {dateLabel(date)}
                </p>
                <Card className="p-0 overflow-hidden divide-y divide-slate-50">
                  {txns.map(t => (
                    <TransactionRow
                      key={t.id}
                      transaction={t}
                      onEdit={openEdit}
                      onDelete={handleDelete}
                    />
                  ))}
                </Card>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Backdrop */}
      <div
        onClick={closeForm}
        className={`fixed inset-0 bg-black/50 z-40 transition-opacity duration-200 ${
          showForm ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Bottom-sheet */}
      <div
        className={`fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white rounded-t-3xl z-50 shadow-2xl transition-transform duration-300 ease-out ${
          showForm ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <TransactionForm
          form={form}
          errors={errors}
          submitting={submitting}
          submitError={submitError}
          isEditing={editingTxn !== null}
          isOpen={showForm}
          lastCategory={lastCategory}
          setField={setField}
          onTypeChange={handleTypeChange}
          onSubmit={handleSubmit}
          onClose={closeForm}
        />
      </div>

      {/* Undo toast */}
      {toast && <Toast message={toast.message} onUndo={toast.onUndo} />}
    </>
  )
}

// ─────────────────────────────────────────────────────────────
// QuickAddStrip
// ─────────────────────────────────────────────────────────────
function QuickAddStrip({ quickType, quickAmount, quickError, quickSubmitting, justAdded, lastCategory, onTypeChange, onAmountChange, onSubmit, onOpenFull }) {
  return (
    <form
      onSubmit={onSubmit}
      className="bg-white border border-slate-200 rounded-2xl px-3 py-2.5 flex items-center gap-2 shadow-sm"
    >
      {/* Income / expense toggle */}
      <button
        type="button"
        onClick={() => onTypeChange(quickType === 'expense' ? 'income' : 'expense')}
        className={`w-8 h-8 rounded-full text-sm font-bold shrink-0 transition-colors active:scale-[0.97] ${
          quickType === 'expense'
            ? 'bg-red-100 text-red-500'
            : 'bg-emerald-100 text-emerald-600'
        }`}
      >
        {quickType === 'expense' ? '−' : '+'}
      </button>

      {/* Last-used category — tapping opens full form */}
      <button
        type="button"
        onClick={onOpenFull}
        className={`shrink-0 text-xs font-semibold px-2.5 py-1.5 rounded-full transition-colors active:scale-[0.97] ${
          lastCategory
            ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            : 'bg-indigo-50 text-indigo-500 hover:bg-indigo-100'
        }`}
      >
        {lastCategory || 'Category'}
      </button>

      {/* Amount input */}
      <div className="flex-1 min-w-0">
        <input
          type="text"
          inputMode="decimal"
          placeholder="Amount"
          value={quickAmount}
          onChange={e => onAmountChange(e.target.value.replace(/[^0-9.]/g, ''))}
          className="w-full text-sm text-slate-700 bg-transparent outline-none placeholder-slate-300 tabular-nums"
        />
        {quickError && <p className="text-xs text-red-500 mt-0.5">{quickError}</p>}
      </div>

      {/* Submit — flashes green check on success */}
      <button
        type="submit"
        disabled={quickSubmitting}
        className={`w-8 h-8 rounded-full text-white flex items-center justify-center shrink-0 transition-all active:scale-[0.97] ${
          quickSubmitting ? 'opacity-50' : ''
        } ${justAdded ? 'bg-emerald-500' : 'bg-indigo-600'}`}
        aria-label="Quick add"
      >
        {quickSubmitting ? <SpinnerMini /> : justAdded ? <CheckIcon /> : <PlusIcon />}
      </button>
    </form>
  )
}

// ─────────────────────────────────────────────────────────────
// TransactionRow
// ─────────────────────────────────────────────────────────────
const TransactionRow = memo(function TransactionRow({ transaction: t, onEdit, onDelete }) {
  const isIncome = Number(t.amount) > 0
  const absAmt   = formatCurrency(Math.abs(Number(t.amount)))
  const initial  = (t.category?.[0] ?? '?').toUpperCase()

  return (
    <div className="flex items-center px-4 py-0 gap-2">
      {/* Tappable edit area — active state gives immediate mobile feedback */}
      <button
        type="button"
        onClick={() => onEdit(t)}
        className="flex items-center gap-3 flex-1 min-w-0 text-left py-3.5 transition-opacity active:opacity-50"
      >
        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
          isIncome ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-500'
        }`}>
          {initial}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-800 truncate">{t.category}</p>
          <p className="text-xs text-slate-400 truncate">
            {t.note ? t.note : shortDate(t.date)}
            {t.note && <span className="text-slate-300"> · {shortDate(t.date)}</span>}
          </p>
        </div>
        <span className={`text-sm font-bold tabular-nums shrink-0 ${
          isIncome ? 'text-emerald-600' : 'text-red-500'
        }`}>
          {isIncome ? '+' : '−'}{absAmt}
        </span>
      </button>

      {/* Delete — always visible, subtle */}
      <button
        type="button"
        onClick={() => onDelete(t.id)}
        className="text-slate-300 hover:text-red-400 active:text-red-500 transition-colors p-1 -mr-1 shrink-0"
        aria-label="Delete transaction"
      >
        <TrashIcon />
      </button>
    </div>
  )
})

// ─────────────────────────────────────────────────────────────
// TransactionForm  (add + edit, inside the bottom sheet)
// ─────────────────────────────────────────────────────────────
function TransactionForm({ form, errors, submitting, submitError, isEditing, isOpen, lastCategory, setField, onTypeChange, onSubmit, onClose }) {
  const amountRef = useRef(null)

  // Auto-focus amount after the sheet slide-in animation completes (300ms)
  useEffect(() => {
    if (!isOpen) return
    const id = setTimeout(() => amountRef.current?.focus(), 320)
    return () => clearTimeout(id)
  }, [isOpen])

  // Most-recently-used category moved to front so it's one tap away
  const cats = useMemo(() => {
    const base = CATEGORIES[form.type] ?? []
    if (!lastCategory || !base.includes(lastCategory)) return base
    return [lastCategory, ...base.filter(c => c !== lastCategory)]
  }, [form.type, lastCategory])

  return (
    <div className="max-h-[90svh] overflow-y-auto">
      <div className="pt-3 pb-1 flex justify-center">
        <div className="w-10 h-1 bg-slate-200 rounded-full" />
      </div>

      <div className="px-5 pt-3 pb-8">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-slate-800">
            {isEditing ? 'Edit Transaction' : 'Add Transaction'}
          </h2>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors" aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">

          {/* Type toggle */}
          <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
            <TypeBtn
              active={form.type === 'income'}
              activeClass="bg-emerald-500 text-white shadow-sm"
              onClick={() => onTypeChange('income')}
              label="+ Income"
            />
            <TypeBtn
              active={form.type === 'expense'}
              activeClass="bg-red-500 text-white shadow-sm"
              onClick={() => onTypeChange('expense')}
              label="− Expense"
            />
          </div>

          {/* Date */}
          <Field label="Date">
            <input
              type="date"
              value={form.date}
              max={todayISO()}
              onChange={e => setField('date', e.target.value)}
              className={inputCls()}
            />
          </Field>

          {/* Category pills — min 44px height, MRU first */}
          <Field label="Category" error={errors.category}>
            <div className="flex flex-wrap gap-2">
              {cats.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setField('category', c)}
                  className={`min-h-[44px] px-3.5 rounded-2xl border text-xs font-semibold transition-all active:scale-[0.97] ${
                    form.category === c
                      ? form.type === 'income'
                        ? 'bg-emerald-500 text-white border-emerald-500 shadow-sm'
                        : 'bg-red-500 text-white border-red-500 shadow-sm'
                      : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-700'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </Field>

          {/* Amount — type=text so we can format with thousand separators */}
          <Field label="Amount" error={errors.amount}>
            <div className="relative">
              <span className={`absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold select-none ${
                form.type === 'income' ? 'text-emerald-500' : 'text-red-500'
              }`}>
                {form.type === 'income' ? '+' : '−'}
              </span>
              <input
                ref={amountRef}
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={formatDisplayAmount(form.amount)}
                onChange={e => setField('amount', e.target.value.replace(/[^0-9.]/g, ''))}
                className={`${inputCls(errors.amount)} pl-8`}
              />
            </div>
          </Field>

          {/* Note */}
          <Field label={<>Note <OptionalLabel /></>}>
            <input
              type="text"
              placeholder="e.g. Monthly rent"
              value={form.note}
              maxLength={120}
              onChange={e => setField('note', e.target.value)}
              className={inputCls()}
            />
          </Field>

          {submitError && (
            <p className="text-sm text-center text-red-500">{submitError}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className={`w-full py-3.5 rounded-xl text-sm font-bold text-white transition-all active:scale-[0.98] ${
              submitting ? 'opacity-60 cursor-not-allowed' : ''
            } ${form.type === 'income' ? 'bg-emerald-500' : 'bg-red-500'}`}
          >
            {submitting
              ? 'Saving…'
              : isEditing
                ? 'Save Changes'
                : `Add ${form.type === 'income' ? 'Income' : 'Expense'}`}
          </button>
        </form>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Toast
// ─────────────────────────────────────────────────────────────
function Toast({ message, onUndo }) {
  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[60] w-[calc(100%-2rem)] max-w-sm pointer-events-none">
      <div className="bg-slate-800 text-white text-sm rounded-2xl px-4 py-3 flex items-center justify-between shadow-xl pointer-events-auto">
        <span>{message}</span>
        <button
          onClick={onUndo}
          className="text-xs font-bold text-indigo-300 hover:text-indigo-200 ml-4 transition-colors"
        >
          Undo
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Small reusable pieces
// ─────────────────────────────────────────────────────────────

function BehaviourFeedback({ discretionaryPct, catBreakdown }) {
  const FLEXIBLE_CATS = ['Dining Out', 'Entertainment', 'Shopping']
  const { totalExp = 0, map = {} } = catBreakdown ?? {}

  const topFlex = FLEXIBLE_CATS
    .map(c => ({ cat: c, amt: map[c] ?? 0 }))
    .sort((a, b) => b.amt - a.amt)[0]
  const topFlexPct = topFlex && totalExp > 0
    ? Math.round(topFlex.amt / totalExp * 100) : 0

  const highDisc   = discretionaryPct !== null && discretionaryPct >= 40
  const highSingle = topFlexPct >= 30

  if (!highDisc && !highSingle) {
    if (discretionaryPct === null) return null
    return (
      <p className="text-xs text-slate-400 text-center mt-3">
        <span className="font-semibold text-slate-500">{discretionaryPct}%</span> discretionary — within a healthy range
      </p>
    )
  }

  return (
    <div className="mt-3 space-y-2">
      {highSingle && topFlex && (
        <div className="rounded-xl bg-red-50 px-3 py-2.5 flex items-start gap-2">
          <span className="w-2 h-2 rounded-full bg-red-500 shrink-0 mt-1" />
          <p className="text-xs text-red-600">
            <span className="font-bold">{topFlex.cat}</span> is {topFlexPct}% of total expenses — your biggest cuttable category.
          </p>
        </div>
      )}
      {highDisc && (
        <div className="rounded-xl bg-amber-50 px-3 py-2.5 flex items-start gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0 mt-1" />
          <p className="text-xs text-amber-700">
            <span className="font-bold">{discretionaryPct}% discretionary spending</span> — trimming here is the fastest way to save more.
          </p>
        </div>
      )}
    </div>
  )
}

function SummaryPill({ label, value, color }) {
  const colors = {
    emerald: 'bg-emerald-50 text-emerald-700',
    red:     'bg-red-50 text-red-600',
    indigo:  'bg-indigo-50 text-indigo-700',
  }
  return (
    <div className={`rounded-xl px-3 py-2.5 ${colors[color] ?? colors.indigo}`}>
      <p className="text-xs font-medium opacity-70">{label}</p>
      <p className="text-sm font-bold mt-0.5 tabular-nums">{value}</p>
    </div>
  )
}

function Field({ label, error, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
        {label}
      </label>
      {children}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  )
}

function TypeBtn({ active, activeClass, onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all ${
        active ? activeClass : 'text-slate-500 hover:text-slate-700'
      }`}
    >
      {label}
    </button>
  )
}

function OptionalLabel() {
  return (
    <span className="normal-case font-normal text-slate-400 text-xs ml-1">(optional)</span>
  )
}

function inputCls(hasError) {
  return [
    'w-full rounded-xl border px-3 py-3 text-sm text-slate-700 bg-white',
    'focus:outline-none focus:ring-2 focus:ring-indigo-300 transition-shadow',
    hasError ? 'border-red-400' : 'border-slate-200',
  ].join(' ')
}

// Formats a raw numeric string with thousand commas, preserving decimal input
function formatDisplayAmount(raw) {
  if (!raw) return ''
  const parts   = raw.split('.')
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return parts.length > 1 ? `${intPart}.${parts[1]}` : intPart
}

function SpinnerMini() {
  return (
    <svg className="animate-spin" width={12} height={12} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

// ── Icons ─────────────────────────────────────────────────────

function PlusIcon() {
  return (
    <svg width={14} height={14} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
      <path strokeLinecap="round" d="M12 5v14M5 12h14" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width={14} height={14} fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width={12} height={12} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width={20} height={20} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}
