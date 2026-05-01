import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Subscribes to the Supabase auth session and returns the current user.
 * Returns { user, loading } – user is null when not signed in.
 */
export function useUser() {
  const [user, setUser]       = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Seed the initial state from the existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // Keep in sync with any auth state changes (sign-in / sign-out / refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => setUser(session?.user ?? null)
    )

    return () => subscription.unsubscribe()
  }, [])

  return { user, loading }
}
