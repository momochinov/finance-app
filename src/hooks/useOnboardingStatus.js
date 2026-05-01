import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function useOnboardingStatus(user) {
  const [onboarded, setOnboarded] = useState(null) // null = loading

  useEffect(() => {
    if (!user) { setOnboarded(null); return }
    let active = true
    supabase
      .from('goals')
      .select('*', { count: 'exact', head: true })
      .then(({ count, error }) => {
        if (!active) return
        setOnboarded(!error && (count ?? 0) > 0)
      })
    return () => { active = false }
  }, [user?.id])

  return { onboarded, setOnboarded }
}
