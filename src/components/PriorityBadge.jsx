import { priorityOf } from '../lib/priority.js'

/** 優先程度小標籤;普通以下預設不顯示(hideNormal)以免列表太雜 */
export default function PriorityBadge({ value, hideNormal = false, className = '' }) {
  const p = priorityOf(value)
  if (hideNormal && p.value <= 3) return null
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${p.cls} ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${p.dot}`} />
      {p.label}
    </span>
  )
}
