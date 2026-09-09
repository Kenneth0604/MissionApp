import { useStore } from '../lib/store.jsx'
import { mainsOf, subsOf } from '../lib/categories.js'

/**
 * 列表頁用的類別篩選:第一列主類別,選了主類別後第二列出現次類別
 * value:'' 全部、'none' 未分類、主類別 id(含其次類別)、次類別 id
 */
export default function CategoryFilter({ kind, value, onChange }) {
  const { categories, categoriesById } = useStore()
  const mains = mainsOf(categories, kind)
  if (mains.length === 0) return null
  const selected = value && value !== 'none' ? categoriesById[value] : null
  const mainId = selected ? (selected.parent_id || selected.id) : ''
  const subs = mainId ? subsOf(categories, mainId) : []

  const Chip = ({ active, onClick, children, tone = 'primary' }) => (
    <button
      onClick={onClick}
      className={`chip shrink-0 py-1 text-xs ${active ? (tone === 'accent' ? 'bg-accent text-white ring-accent' : 'chip-active') : ''}`}
    >
      {children}
    </button>
  )

  return (
    <div className="space-y-1.5">
      <div className="no-scrollbar -mx-4 flex touch-pan-x gap-2 overflow-x-auto px-4 py-1">
        <Chip active={value === ''} onClick={() => onChange('')}>全部</Chip>
        {mains.map((c) => (
          <Chip key={c.id} active={mainId === c.id} onClick={() => onChange(c.id)}>{c.name}</Chip>
        ))}
        <Chip active={value === 'none'} onClick={() => onChange('none')}>未分類</Chip>
      </div>
      {subs.length > 0 && (
        <div className="no-scrollbar -mx-4 flex touch-pan-x gap-2 overflow-x-auto px-4 py-1">
          <Chip tone="accent" active={value === mainId} onClick={() => onChange(mainId)}>全部次類別</Chip>
          {subs.map((c) => (
            <Chip key={c.id} tone="accent" active={value === c.id} onClick={() => onChange(c.id)}>{c.name}</Chip>
          ))}
        </div>
      )}
    </div>
  )
}
