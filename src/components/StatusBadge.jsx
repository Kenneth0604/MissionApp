import { REDEMPTION_LABEL, STATUS_LABEL } from '../lib/store.jsx'

const STYLE = {
  pending: 'bg-warning-soft text-warning',
  submitted: 'bg-info-soft text-info',
  approved: 'bg-success-soft text-success',
  rejected: 'bg-danger-soft text-danger',
  requested: 'bg-info-soft text-info',
  fulfilled: 'bg-success-soft text-success',
}

export default function StatusBadge({ status, className = '' }) {
  const label = STATUS_LABEL[status] ?? REDEMPTION_LABEL[status] ?? status
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STYLE[status] ?? 'bg-surface-2 text-muted'} ${className}`}>
      {label}
    </span>
  )
}
