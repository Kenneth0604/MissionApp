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
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('')
  const [busy, setBusy] = useState(false)

  async function onAdd() {
    if (!name.trim()) return toast.error('請輸入類別名稱')
    setBusy(true)
    try {
      const c = await createCategory({ kind, name, emoji })
      onChange(c.id)
      setAdding(false)
      setName('')
      setEmoji('')
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
            {c.emoji && <span className="mr-1" aria-hidden>{c.emoji}</span>}
            {c.name}
          </button>
        ))}
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className="chip border-dashed text-muted">
            ＋ 新類別
          </button>
        )}
      </div>
      {adding && (
        <div className="mt-2 flex gap-2">
          <input value={emoji} onChange={(e) => setEmoji(e.target.value.slice(0, 2))} placeholder="😀" className="input w-16 text-center" aria-label="表情符號(選填)" />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="類別名稱" className="input flex-1" autoFocus />
          <button type="button" onClick={onAdd} disabled={busy} className="btn-primary px-3 py-2 text-sm">加入</button>
          <button type="button" onClick={() => setAdding(false)} className="btn-secondary px-3 py-2 text-sm">取消</button>
        </div>
      )}
    </div>
  )
}
