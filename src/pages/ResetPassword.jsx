import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function ResetPassword() {
  const navigate  = useNavigate()
  const [password,  setPassword]  = useState('')
  const [confirm,   setConfirm]   = useState('')
  const [loading,   setLoading]   = useState(false)
  const [message,   setMessage]   = useState('')
  const [error,     setError]     = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError(''); setMessage('')

    if (password !== confirm) { setError('Passwords do not match'); return }
    if (password.length < 6)  { setError('Password must be at least 6 characters'); return }

    setLoading(true)
    const { error: err } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (err) { setError(err.message); return }

    setMessage('Password updated. Redirecting…')
    setTimeout(() => navigate('/dashboard'), 1800)
  }

  return (
    <div className="min-h-svh bg-slate-50 flex items-center justify-center px-5">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 h-12 w-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center text-xl font-black">
            $
          </div>
          <h1 className="text-3xl font-black tracking-tight text-slate-950">
            Finance Lens
          </h1>
          <p className="mt-2 text-sm text-slate-500">Set your new password</p>
        </div>

        <div className="rounded-3xl bg-white border border-slate-200 shadow-sm p-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                New password
              </span>
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 text-base text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="At least 6 characters"
              />
            </label>

            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Confirm password
              </span>
              <input
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={6}
                className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 text-base text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Repeat new password"
              />
            </label>

            {error   && <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}
            {message && <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl bg-indigo-600 py-3.5 text-sm font-black text-white shadow-lg shadow-indigo-200 transition active:scale-[0.98] disabled:opacity-60"
            >
              {loading ? 'Updating…' : 'Update password'}
            </button>
          </form>

          <p className="mt-5 text-center text-xs text-slate-400">
            Your financial data stays private and protected.
          </p>
        </div>
      </div>
    </div>
  )
}
