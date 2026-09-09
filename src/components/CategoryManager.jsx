import { useState } from 'react'
import { useStore } from '../lib/store.jsx'
import { useToast } from '../lib/toast.jsx'

const KINDS = [
  { key: 'task', label: '任務類別' },
  { key: 'reward', label: '獎勵類別' },
]

/** 設定頁:管理任務 / 獎勵類別 */
export default function CategoryManager() {
  const { categories, tasks, rewards, createCategory, updateCategory, deleteCategory } = useStore()
  const toast = useToast()
  const [kind, setKind] = useState('task')
  const [newName, setNewName] = useState('')
  const [newEmoji, setNewEmoji] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editEmoji, setEditEmoji] = useState('')
  const [busy, setBusy] = useState(false)

  const list = categories.filter((c) => c.kind === kind)
  const usage = (id) => (kind === 'task' ? tasks : rewards).filter((x) => x.category_id === id).length

  async function run(fn, ok) {
    setBusy(true)
    try {
      await fn()
      if (ok) toast.success(ok)
    } catch (err) {
      toast.error(err)
    } finally {
      setBusy(false)
    }
  }

  function onAdd(e) {
    e.preventDefault()
    if (!newName.trim()) return
    run(async () => {
      await createCategory({ kind, name: newName, emoji: newEmoji })
      setNewName('')
      setNewEmoji('')
    }, '已新增類別')
  }

  function startEdit(c) {
    setEditingId(c.id)
    setEditName(c.name)
    setEditEmoji(c.emoji ?? '')
  }

  function onSave() {
    if (!editName.trim()) return toast.error('名稱不能空白')
    run(async () => {
      await updateCategory(editingId, { name: editName, emoji: editEmoji })
      setEditingId(null)
    }, '已儲存')
  }

  function onDelete(c) {
    const n = usage(c.id)
    const msg = n > 0 ? `「${c.name}」目前有 ${n} 筆資料使用中,刪除後這些資料會變成未分類。確定刪除?` : `刪除類別「${c.name}」?`
    if (!confirm(msg)) return
    run(() => deleteCategory(c.id), '已刪除')
  }

  return (
    <div className="card p-4">
      <div className="flex rounded-xl bg-surface-2 p-1">
        {KINDS.map((k) => (
          <button key={k.key} onClick={() => { setKind(k.key); setEditingId(null) }} className={`flex-1 rounded-lg py-1.5 text-sm font-medium ${kind === k.key ? 'bg-surface text-primary shadow-sm' : 'text-muted'}`}>
            {k.label}
          </button>
        ))}
      </div>

      <ul className="mt-3 divide-y divide-line">
        {list.length === 0 && <li className="py-3 text-center text-sm text-muted">還沒有類別</li>}
        {list.map((c) => (
          <li key={c.id} className="flex items-center gap-2 py-2">
            {editingId === c.id ? (
              <>
                <input value={editEmoji} onChange={(e) => setEditEmoji(e.target.value.slice(0, 2))} className="input w-14 px-2 py-1.5 text-center" aria-label="表情符號" />
                <input value={editName} onChange={(e) => setEditName(e.target.value)} className="input flex-1 py-1.5" autoFocus />
                <button onClick={onSave} disabled={busy} className="btn-primary px-3 py-1.5 text-xs">儲存</button>
                <button onClick={() => setEditingId(null)} className="btn-secondary px-3 py-1.5 text-xs">取消</button>
              </>
            ) : (
              <>
                <span className="w-8 text-center text-lg">{c.emoji ?? '·'}</span>
                <span className="flex-1 text-sm text-ink">{c.name}</span>
                <span className="text-xs text-muted">{usage(c.id)} 筆</span>
                <button onClick={() => startEdit(c)} className="chip px-2.5 py-1 text-xs">編輯</button>
                <button onClick={() => onDelete(c)} disabled={busy} className="chip px-2.5 py-1 text-xs text-danger">刪除</button>
              </>
            )}
          </li>
        ))}
      </ul>

      <form onSubmit={onAdd} className="mt-3 flex gap-2">
        <input value={newEmoji} onChange={(e) => setNewEmoji(e.target.value.slice(0, 2))} placeholder="😀" className="input w-14 px-2 text-center" aria-label="表情符號(選填)" />
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={`新增${kind === 'task' ? '任務' : '獎勵'}類別`} className="input flex-1" />
        <button type="submit" disabled={busy || !newName.trim()} className="btn-primary px-3 text-sm">新增</button>
      </form>
    </div>
  )
}
