// All financial calculations are handled by Supabase views.
// This module provides only formatting helpers used across the UI.

export function formatCurrency(amount) {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

// 'YYYY-MM'  →  'Feb 26'
export function formatMonth(yyyyMM) {
  const [year, month] = yyyyMM.split('-')
  return new Date(Number(year), Number(month) - 1, 1).toLocaleString('default', {
    month: 'short',
    year: '2-digit',
  })
}

// Returns the current month as 'YYYY-MM'
export function currentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

// Compact axis label: 45000 → '$45k'
export function fmtAxis(v) {
  const abs = Math.abs(v)
  if (abs >= 1000) return `$${Math.round(v / 1000)}k`
  return `$${v}`
}
