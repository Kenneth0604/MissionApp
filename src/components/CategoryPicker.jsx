import { useState } from 'react'
import { useStore } from '../lib/store.jsx'
import { useToast } from '../lib/toast.jsx'
import { mainsOf, subsOf } from '../lib/categories.js'

/**
 * 類別選擇器(表單用):先選主類別,再選次類別(可不選)
 * kind: 'task' | 'reward'
 * value: 類別 id(次類別或主類別)或 ''(未分類)
 */
export default function CategoryPicker({ kind, value, onChange }) {
  const { categories, categoriesById, createCategory } = useStore()
  const toast = useToast()
  const mains = mainsOf(categories, kind)
  const selected = value ? categoriesById[value] : null
  const mainId = selected ? (selected.parent_id || selected.id) : ''
  const subs = mainId ? subsOf(categories, mainId) : []

  const [adding, setAdding] = useState(null) // null | 'main' | 'sub'
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  async function onAdd() {
    if (!name.trim()) return toast.error('請輸入類別名稱')
    setBusy(true)
    try {
      const c = await createCategory({ kind, name, parent_id: adding === 'sub' ? mainId : null })
      onChange(c.id)
      setAdding(null)
      setName('')
    } catch (err) {
      toast.error(err)
    } finally {
      setBusy(false)
    }
  }

  const AddBox = (
    <div className="mt-2 flex gap-2">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder={adding === 'sub' ? '次類別名稱' : '主類別名稱'} className="input flex-1 py-2" autoFocus />
      <button type="button" onClick={onAdd} disabled={busy} className="btn-primary px-3 py-2 text-sm">加入</button>
      <button type="button" onClick={() => { setAdding(null); setName('') }} className="btn-secondary px-3 py-2 text-sm">取消</button>
    </div>
  )

  return (
    <div className="space-y-2">
      <div>
        <p className="mb-1.5 text-xs font-medium text-muted">主類別</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => onChange('')} className={`chip ${!value ? 'chip-active' : ''}`}>未分類</button>
          {mains.map((c) => (
            <button type="button" key={c.id} onClick={() => onChange(c.id)} className={`chip ${mainId === c.id ? 'chip-active' : ''}`}>
              {c.name}
            </button>
          ))}
          {adding !== 'main' && (
            <button type="button" onClick={() => { setAdding('main'); setName('') }} className="chip text-muted">＋ 新主類別</button>
          )}
        </div>
        {adding === 'main' && AddBox}
      </div>

      {mainId && (
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted">次類別(可不選)</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => onChange(mainId)} className={`chip ${value === mainId ? 'bg-accent text-white ring-accent' : ''}`}>
              不分次類別
            </button>
            {subs.map((c) => (
              <button type="button" key={c.id} onClick={() => onChange(c.id)} className={`chip ${value === c.id ? 'bg-accent text-white ring-accent' : ''}`}>
                {c.name}
              </button>
            ))}
            {adding !== 'sub' && (
              <button type="button" onClick={() => { setAdding('sub'); setName('') }} className="chip text-muted">＋ 新次類別</button>
            )}
          </div>
          {adding === 'sub' && AddBox}
        </div>
      )}
    </div>
  )
}
