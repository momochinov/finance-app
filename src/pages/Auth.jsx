import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Auth() {
  const [mode,     setMode]     = useState('login') // 'login' | 'signup' | 'reset'
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [message,  setMessage]  = useState('')
  const [error,    setError]    = useState('')

  function clearMessages() { setError(''); setMessage('') }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    clearMessages()

    const res = mode === 'signup'
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password })

    if (res.error) setError(res.error.message)
    else if (mode === 'signup') setMessage('Account created. Check your email if confirmation is required.')

    setLoading(false)
  }

  async function handleReset(e) {
    e.preventDefault()
    setLoading(true)
    clearMessages()

    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/reset-password',
    })

    if (err) setError(err.message)
    else setMessage('Check your email for a reset link.')

    setLoading(false)
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
          <p className="mt-2 text-sm text-slate-500">
            Build saving habits. Track your future.
          </p>
        </div>

        <div className="rounded-3xl bg-white border border-slate-200 shadow-sm p-5">

          {/* ── Tabs (login / signup) — hidden on reset ── */}
          {mode !== 'reset' && (
            <div className="grid grid-cols-2 gap-1 rounded-2xl bg-slate-100 p-1 mb-5">
              <button
                type="button"
                onClick={() => { setMode('login'); clearMessages() }}
                className={`py-2 rounded-xl text-sm font-bold transition ${
                  mode === 'login' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'
                }`}
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => { setMode('signup'); clearMessages() }}
                className={`py-2 rounded-xl text-sm font-bold transition ${
                  mode === 'signup' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'
                }`}
              >
                Sign up
              </button>
            </div>
          )}

          {/* ── Login / Signup form ── */}
          {mode !== 'reset' && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  Email
                </span>
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 text-base text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="you@example.com"
                />
              </label>

              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  Password
                </span>
                <input
                  type="password"
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 text-base text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="At least 6 characters"
                />
                {mode === 'login' && (
                  <div className="text-right mt-1.5">
                    <button
                      type="button"
                      onClick={() => { setMode('reset'); clearMessages() }}
                      className="text-xs text-indigo-500 font-semibold hover:text-indigo-700 active:opacity-60 transition-opacity"
                    >
                      Forgot password?
                    </button>
                  </div>
                )}
              </label>

              {error   && <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}
              {message && <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-2xl bg-indigo-600 py-3.5 text-sm font-black text-white shadow-lg shadow-indigo-200 transition active:scale-[0.98] disabled:opacity-60"
              >
                {loading ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
              </button>
            </form>
          )}

          {/* ── Reset password form ── */}
          {mode === 'reset' && (
            <form onSubmit={handleReset} className="space-y-4">
              <div className="mb-1">
                <p className="text-base font-bold text-slate-900">Reset your password</p>
                <p className="text-xs text-slate-400 mt-1">
                  Enter your email and we'll send a reset link.
                </p>
              </div>

              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  Email
                </span>
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 text-base text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="you@example.com"
                />
              </label>

              {error   && <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}
              {message && <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-2xl bg-indigo-600 py-3.5 text-sm font-black text-white shadow-lg shadow-indigo-200 transition active:scale-[0.98] disabled:opacity-60"
              >
                {loading ? 'Sending…' : 'Send reset link'}
              </button>

              <button
                type="button"
                onClick={() => { setMode('login'); clearMessages() }}
                className="w-full text-sm font-semibold text-slate-400 hover:text-slate-600 active:opacity-60 transition-opacity"
              >
                ← Back to sign in
              </button>
            </form>
          )}

          <p className="mt-5 text-center text-xs text-slate-400">
            Your financial data stays private and protected.
          </p>
        </div>
      </div>
    </div>
  )
}
