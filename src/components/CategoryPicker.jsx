import { useState } from 'react'
import { useStore } from '../lib/store.jsx'
import { useToast } from '../lib/toast.jsx'

/**
 * 類別選擇器(表單用)
 * kind: 'task' | 'reward'
 * value: category id 或 ''(未分類)
 */
export default function CategoryPicker({ kind, value, onChange }) {
  const { categories, createCategory } = useStore()
  const toast = useToast()
  const list = categories.filter((c) => c.kind === kind)
  const selected = list.find((c) => c.id === value)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)

  async function onAdd() {
    if (!name.trim()) return toast.error('請輸入類別名稱')
    setBusy(true)
    try {
      const c = await createCategory({ kind, name, description })
      onChange(c.id)
      setAdding(false)
      setName('')
      setDescription('')
    } catch (err) {
      toast.error(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => onChange('')} className={`chip ${!value ? 'chip-active' : ''}`}>
          未分類
        </button>
        {list.map((c) => (
          <button type="button" key={c.id} onClick={() => onChange(c.id)} className={`chip ${value === c.id ? 'chip-active' : ''}`}>
            {c.name}
          </button>
        ))}
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className="chip text-muted">
            ＋ 新類別
          </button>
        )}
      </div>
      {selected?.description && <p className="mt-1.5 text-xs text-muted">{selected.description}</p>}
      {adding && (
        <div className="mt-2 space-y-2 rounded-xl bg-surface-2 p-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="類別名稱" className="input" autoFocus />
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="說明(選填)" className="input" />
          <div className="flex gap-2">
            <button type="button" onClick={() => setAdding(false)} className="btn-secondary flex-1 py-2 text-sm">取消</button>
            <button type="button" onClick={onAdd} disabled={busy} className="btn-primary flex-1 py-2 text-sm">加入</button>
          </div>
        </div>
      )}
    </div>
  )
}
