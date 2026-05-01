import Card from './Card'

export default function MetricCard({ label, value, sub, accent }) {
  const textColor = {
    green:   'text-emerald-600',
    red:     'text-red-500',
    amber:   'text-amber-600',
    indigo:  'text-indigo-600',
    default: 'text-slate-700',
  }[accent] || 'text-slate-700'

  const dotColor = {
    green:   'bg-emerald-500',
    red:     'bg-red-500',
    amber:   'bg-amber-500',
    indigo:  'bg-indigo-500',
    default: 'bg-slate-400',
  }[accent] || 'bg-slate-400'

  return (
    <Card className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
        <span className="text-xs text-slate-400 font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <span className={`text-2xl font-extrabold tracking-tight leading-none ${textColor}`}>{value}</span>
      {sub && <span className="text-xs text-slate-400 mt-1">{sub}</span>}
    </Card>
  )
}
