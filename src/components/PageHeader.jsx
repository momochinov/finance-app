export default function PageHeader({ title, sub }) {
  return (
    <div className="pt-8 pb-4">
      <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{title}</h1>
      {sub && <p className="text-sm text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}
