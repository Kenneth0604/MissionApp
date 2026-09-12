import { useState } from 'react'
import { useStore } from '../lib/store.jsx'
import { PRIORITIES } from '../lib/priority.js'
import { mainsOf, subsOf } from '../lib/categories.js'

export const EMPTY_FILTER = { q: '', priorities: [], categories: [] }
export const isFilterActive = (f) => Boolean(f.q.trim()) || f.priorities.length > 0 || f.categories.length > 0

/** 搜尋字串 → 關鍵字(以空白切開,全部都要出現才算符合) */
const termsOf = (q) => q.trim().toLowerCase().split(/\s+/).filter(Boolean)

/**
 * 搜尋分數:0 = 不符合;越高越前面。
 * 每個關鍵字都要出現在任一欄位;命中標題加 3 分、類別 2 分、其他(說明 / 備註 / 選項)1 分。
 */
export function searchScore(t, q) {
  const terms = termsOf(q)
  if (terms.length === 0) return 1
  const title = (t.title ?? '').toLowerCase()
  const cat = [t.category?.name, t.category?.parent?.name].filter(Boolean).join(' ').toLowerCase()
  const rest = [t.description, t.note, t.chosen_choice, ...(t.choices ?? [])].filter(Boolean).join(' ').toLowerCase()
  let score = 0
  for (const term of terms) {
    if (title.includes(term)) score += 3
    else if (cat.includes(term)) score += 2
    else if (rest.includes(term)) score += 1
    else return 0 // 任一關鍵字沒出現就不符合(AND)
  }
  return score
}

/** 任務是否符合篩選(優先度、類別可複選;文字搜尋見 searchScore) */
export function matchTask(t, f) {
  if (f.priorities.length && !f.priorities.includes(t.priority ?? 3)) return false
  if (f.categories.length) {
    const own = t.category_id
    const parent = t.category?.parent_id
    if (!own || !(f.categories.includes(own) || (parent && f.categories.includes(parent)))) return false
  }
  return searchScore(t, f.q) > 0
}

/** 有搜尋字時依分數排序(高分在前),沒有就維持原順序 */
export function sortBySearch(list, q) {
  if (!termsOf(q).length) return list
  return [...list].sort((a, b) => searchScore(b, q) - searchScore(a, q))
}

const toggle = (list, v) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

/** 任務列表篩選列:搜尋框 + 可展開的優先度 / 類別多選 */
export default function TaskFilter({ value, onChange, kind = 'task' }) {
  const { categories } = useStore()
  const [open, setOpen] = useState(false)
  const mains = mainsOf(categories, kind)
  const selectedMains = mains.filter((m) => value.categories.includes(m.id))
  const subs = selectedMains.flatMap((m) => subsOf(categories, m.id))
  const count = value.priorities.length + value.categories.length

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="search"
          value={value.q}
          onChange={(e) => onChange({ ...value, q: e.target.value })}
          placeholder="搜尋任務…"
          className="input flex-1 py-2"
        />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={`chip shrink-0 gap-1 py-2 ${count > 0 ? 'chip-active' : ''}`}
        >
          篩選{count > 0 && ` · ${count}`}
        </button>
        {isFilterActive(value) && (
          <button type="button" onClick={() => onChange(EMPTY_FILTER)} className="chip shrink-0 py-2 text-muted">清除</button>
        )}
      </div>

      {open && (
        <div className="card space-y-3 p-3">
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted">優先程度(可複選)</p>
            <div className="flex flex-wrap gap-2">
              {PRIORITIES.map((p) => (
                <button
                  type="button"
                  key={p.value}
                  onClick={() => onChange({ ...value, priorities: toggle(value.priorities, p.value) })}
                  className={`chip py-1.5 text-xs ${value.priorities.includes(p.value) ? `${p.solid} font-bold` : p.cls}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          {mains.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted">類別(可複選;選主類別會包含其次類別)</p>
              <div className="flex flex-wrap gap-2">
                {mains.map((c) => (
                  <button
                    type="button"
                    key={c.id}
                    onClick={() => onChange({ ...value, categories: toggle(value.categories, c.id) })}
                    className={`chip py-1.5 text-xs ${value.categories.includes(c.id) ? 'chip-active' : ''}`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
              {subs.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {subs.map((c) => (
                    <button
                      type="button"
                      key={c.id}
                      onClick={() => onChange({ ...value, categories: toggle(value.categories, c.id) })}
                      className={`chip py-1 text-xs ${value.categories.includes(c.id) ? 'bg-accent text-white ring-accent' : ''}`}
                    >
                      {c.parent?.name} › {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
