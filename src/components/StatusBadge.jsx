import { STATUS_LABEL } from '../lib/store.jsx'

const STYLE = {
  pending: 'bg-amber-100 text-amber-800',
  submitted: 'bg-sky-100 text-sky-800',
  approved: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-rose-100 text-rose-800',
}

export default function StatusBadge({ status, className = '' }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STYLE[status] ?? 'bg-slate-100 text-slate-700'} ${className}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}
