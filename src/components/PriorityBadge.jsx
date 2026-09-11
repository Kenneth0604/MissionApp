import { priorityOf } from '../lib/priority.js'

/** 優先程度標籤:整格依等級上色 */
export default function PriorityBadge({ value, hideNormal = false, className = '' }) {
  const p = priorityOf(value)
  if (hideNormal && p.value <= 3) return null
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${p.solid} ${className}`}>
      {p.label}
    </span>
  )
}
