export default function Badge({ label, variant = 'default' }) {
  const variants = {
    green:   'bg-emerald-100 text-emerald-700',
    red:     'bg-red-100 text-red-600',
    amber:   'bg-amber-100 text-amber-700',
    indigo:  'bg-indigo-100 text-indigo-700',
    default: 'bg-slate-100 text-slate-600',
  }
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${variants[variant] ?? variants.default}`}>
      {label}
    </span>
  )
}
