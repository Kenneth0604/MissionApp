/** 顯示類別小標籤 */
export default function CategoryChip({ category, className = '' }) {
  if (!category) return null
  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-info ${className}`}>
      {category.emoji && <span aria-hidden>{category.emoji}</span>}
      {category.name}
    </span>
  )
}
