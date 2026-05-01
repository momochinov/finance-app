import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const SELECT_COLS = 'id, date, month, type, category, amount, note, created_at'

function sortDesc(arr) {
  return [...arr].sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      b.created_at.localeCompare(a.created_at)
  )
}

export function useTransactions() {
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('transactions')
      .select(SELECT_COLS)
      .order('date',       { ascending: false })
      .order('created_at', { ascending: false })

    if (error) setError(error.message)
    else       setTransactions(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  async function addTransaction(payload) {
    const { data, error } = await supabase
      .from('transactions')
      .insert(payload)
      .select(SELECT_COLS)
      .single()

    if (error) throw error
    setTransactions(prev => sortDesc([data, ...prev]))
    return data
  }

  async function updateTransaction(id, payload) {
    const { data, error } = await supabase
      .from('transactions')
      .update(payload)
      .eq('id', id)
      .select(SELECT_COLS)
      .single()

    if (error) throw error
    setTransactions(prev => sortDesc(prev.map(t => (t.id === id ? data : t))))
    return data
  }

  // Optimistic delete — returns { undo, commit } for a 5-second undo window.
  // commit() sends the server request; undo() restores the item locally.
  function deleteTransaction(id) {
    const txn = transactions.find(t => t.id === id)
    setTransactions(prev => prev.filter(t => t.id !== id))

    let settled = false

    async function commit() {
      if (settled) return
      settled = true
      await supabase.from('transactions').delete().eq('id', id)
      // Errors silently swallowed — item already removed from local state.
      // A hard refresh will re-sync if the server delete failed.
    }

    function undo() {
      if (settled) return
      settled = true
      if (txn) setTransactions(prev => sortDesc([txn, ...prev]))
    }

    return { undo, commit }
  }

  return { transactions, loading, error, addTransaction, updateTransaction, deleteTransaction }
}
