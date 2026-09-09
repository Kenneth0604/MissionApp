import { useState } from 'react'
import { useStore } from '../lib/store.jsx'
import { useToast } from '../lib/toast.jsx'

const KINDS = [
  { key: 'task', label: '任務類別' },
  { key: 'reward', label: '獎勵類別' },
]

/** 設定頁:管理任務 / 獎勵類別(名稱 + 文字說明) */
export default function CategoryManager() {
  const { categories, tasks, rewards, createCategory, updateCategory, deleteCategory } = useStore()
  const toast = useToast()
  const [kind, setKind] = useState('task')
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
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
      await createCategory({ kind, name: newName, description: newDesc })
      setNewName('')
      setNewDesc('')
    }, '已新增類別')
  }

  function startEdit(c) {
    setEditingId(c.id)
    setEditName(c.name)
    setEditDesc(c.description ?? '')
  }

  function onSave() {
    if (!editName.trim()) return toast.error('名稱不能空白')
    run(async () => {
      await updateCategory(editingId, { name: editName, description: editDesc })
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
          <li key={c.id} className="py-2.5">
            {editingId === c.id ? (
              <div className="space-y-2">
                <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="類別名稱" className="input py-1.5" autoFocus />
                <input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder="說明(選填)" className="input py-1.5" />
                <div className="flex justify-end gap-2">
                  <button onClick={() => setEditingId(null)} className="btn-secondary px-3 py-1.5 text-xs">取消</button>
                  <button onClick={onSave} disabled={busy} className="btn-primary px-3 py-1.5 text-xs">儲存</button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{c.name}</p>
                  {c.description && <p className="truncate text-xs text-muted">{c.description}</p>}
                </div>
                <span className="shrink-0 text-xs text-muted">{usage(c.id)} 筆</span>
                <button onClick={() => startEdit(c)} className="chip shrink-0 px-2.5 py-1 text-xs">編輯</button>
                <button onClick={() => onDelete(c)} disabled={busy} className="chip shrink-0 px-2.5 py-1 text-xs text-danger">刪除</button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <form onSubmit={onAdd} className="mt-3 space-y-2 border-t border-line pt-3">
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={`新增${kind === 'task' ? '任務' : '獎勵'}類別名稱`} className="input" />
        <div className="flex gap-2">
          <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="說明(選填)" className="input flex-1" />
          <button type="submit" disabled={busy || !newName.trim()} className="btn-primary shrink-0 px-4 text-sm">新增</button>
        </div>
      </form>
    </div>
  )
}
