/** 顯示類別小標籤(滑鼠停留可看說明) */
export default function CategoryChip({ category, className = '' }) {
  if (!category) return null
  return (
    <span title={category.description || undefined} className={`inline-flex items-center rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-info ${className}`}>
      {category.name}
    </span>
  )
}
