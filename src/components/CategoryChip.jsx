import { labelOf } from '../lib/categories.js'

/** 顯示類別小標籤:「主類別 › 次類別」 */
export default function CategoryChip({ category, className = '' }) {
  if (!category) return null
  return (
    <span className={`inline-flex items-center rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-info ${className}`}>
      {labelOf(category)}
    </span>
  )
}
