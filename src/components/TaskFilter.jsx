import { useState } from 'react'
import { useStore } from '../lib/store.jsx'
import { PRIORITIES } from '../lib/priority.js'
import { mainsOf, subsOf } from '../lib/categories.js'

export const EMPTY_FILTER = { q: '', priorities: [], categories: [] }
export const isFilterActive = (f) => Boolean(f.q.trim()) || f.priorities.length > 0 || f.categories.length > 0

/** 任務是否符合篩選(優先度、類別可複選;文字搜尋比對標題、說明、選項、說明備註) */
export function matchTask(t, f) {
  if (f.priorities.length && !f.priorities.includes(t.priority ?? 3)) return false
  if (f.categories.length) {
    const own = t.category_id
    const parent = t.category?.parent_id
    if (!own || !(f.categories.includes(own) || (parent && f.categories.includes(parent)))) return false
  }
  const q = f.q.trim().toLowerCase()
  if (q) {
    const hay = [t.title, t.description, t.note, t.chosen_choice, ...(t.choices ?? []), t.category?.name, t.category?.parent?.name]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    if (!hay.includes(q)) return false
  }
  return true
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
