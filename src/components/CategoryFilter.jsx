import { useStore } from '../lib/store.jsx'

/** 列表頁用的類別篩選列;value 為 category id、'' 為全部、'none' 為未分類 */
export default function CategoryFilter({ kind, value, onChange }) {
  const { categories } = useStore()
  const list = categories.filter((c) => c.kind === kind)
  if (list.length === 0) return null
  return (
    <div className="no-scrollbar -mx-4 flex touch-pan-x gap-2 overflow-x-auto px-4 py-1">
      <button onClick={() => onChange('')} className={`chip shrink-0 py-1 text-xs ${value === '' ? 'chip-active' : ''}`}>全部</button>
      {list.map((c) => (
        <button key={c.id} onClick={() => onChange(c.id)} className={`chip shrink-0 py-1 text-xs ${value === c.id ? 'chip-active' : ''}`}>
          {c.name}
        </button>
      ))}
      <button onClick={() => onChange('none')} className={`chip shrink-0 py-1 text-xs ${value === 'none' ? 'chip-active' : ''}`}>未分類</button>
    </div>
  )
}
