import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useUser } from './hooks/useUser'
import { useOnboardingStatus } from './hooks/useOnboardingStatus'
import { supabase } from './lib/supabase'

import BottomNav from './components/BottomNav'
import Dashboard from './pages/Dashboard'
import Transactions from './pages/Transactions'
import Budget from './pages/Budget'
import Balances from './pages/Balances'
import Goal from './pages/Goal'
import Auth from './pages/Auth'
import Onboarding from './pages/Onboarding'
import ResetPassword from './pages/ResetPassword'

function Spinner() {
  return (
    <div className="min-h-svh bg-slate-50 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function UserTopBar({ email }) {
  async function handleSignOut() {
    await supabase.auth.signOut()
  }

  return (
    <div className="flex items-center justify-between px-4 pt-3 pb-1">
      <span className="text-xs text-slate-400 truncate max-w-[200px]">{email}</span>
      <button
        onClick={handleSignOut}
        className="text-xs text-slate-400 font-semibold hover:text-slate-600 active:opacity-60 transition-opacity"
      >
        Sign out
      </button>
    </div>
  )
}

function AppRoutes() {
  const { user, loading: authLoading } = useUser()
  const { onboarded, setOnboarded } = useOnboardingStatus(user)

  // 🔥 DEBUG（你可以睇 console）
  console.log('DEBUG STATE:', {
    user,
    authLoading,
    onboarded
  })

  // 1️⃣ Auth loading
  if (authLoading) {
    return <Spinner />
  }

  // 2️⃣ 未登入
  if (!user) {
    return (
      <Routes>
        <Route path="/auth"           element={<Auth />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="*"               element={<Navigate to="/auth" replace />} />
      </Routes>
    )
  }

  // 3️⃣ onboarding loading / fail-safe
  if (user && onboarded === null) {
    console.warn('⚠️ onboarded is null → fallback to onboarding')
    return (
      <Routes>
        <Route
          path="/onboarding"
          element={<Onboarding onComplete={() => setOnboarded(true)} />}
        />
        <Route path="*" element={<Navigate to="/onboarding" replace />} />
      </Routes>
    )
  }

  // 4️⃣ 未 onboarding
  if (!onboarded) {
    return (
      <Routes>
        <Route
          path="/onboarding"
          element={<Onboarding onComplete={() => setOnboarded(true)} />}
        />
        <Route path="*" element={<Navigate to="/onboarding" replace />} />
      </Routes>
    )
  }

  // 5️⃣ 正常 app
  return (
    <div className="flex flex-col min-h-svh bg-slate-50 max-w-md mx-auto relative">
      <UserTopBar email={user.email} />

      <main className="flex-1 overflow-y-auto pb-20">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/budget" element={<Budget />} />
          <Route path="/balances" element={<Balances />} />
          <Route path="/goal" element={<Goal />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>

      <BottomNav />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}
