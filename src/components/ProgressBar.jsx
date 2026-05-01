export default function ProgressBar({ pct, over }) {
  const clamped = Math.min(pct, 100)
  return (
    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
      <div
        className={`h-2 rounded-full transition-all duration-500 ${over ? 'bg-red-500' : 'bg-emerald-500'}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
}
