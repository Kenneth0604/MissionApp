import { useState } from 'react'
import { useStore } from '../lib/store.jsx'
import { useToast } from '../lib/toast.jsx'
import { mainsOf, subsOf } from '../lib/categories.js'

const KINDS = [
  { key: 'task', label: '任務類別' },
  { key: 'reward', label: '獎勵類別' },
]

/** 設定頁:管理主類別與次類別 */
export default function CategoryManager() {
  const { categories, tasks, rewards, createCategory, updateCategory, deleteCategory } = useStore()
  const toast = useToast()
  const [kind, setKind] = useState('task')
  const [newMain, setNewMain] = useState('')
  const [subInputs, setSubInputs] = useState({}) // mainId -> 輸入中的次類別名稱
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [busy, setBusy] = useState(false)

  const mains = mainsOf(categories, kind)
  const items = kind === 'task' ? tasks : rewards
  const usage = (c) => {
    const ids = new Set([c.id, ...subsOf(categories, c.id).map((s) => s.id)])
    return items.filter((x) => ids.has(x.category_id)).length
  }

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

  function addMain(e) {
    e.preventDefault()
    if (!newMain.trim()) return
    run(async () => { await createCategory({ kind, name: newMain }); setNewMain('') }, '已新增主類別')
  }
  function addSub(mainId) {
    const name = (subInputs[mainId] || '').trim()
    if (!name) return
    run(async () => {
      await createCategory({ kind, name, parent_id: mainId })
      setSubInputs((s) => ({ ...s, [mainId]: '' }))
    }, '已新增次類別')
  }
  function saveEdit() {
    if (!editName.trim()) return toast.error('名稱不能空白')
    run(async () => { await updateCategory(editingId, { name: editName }); setEditingId(null) }, '已儲存')
  }
  function remove(c, isMain) {
    const n = usage(c)
    const extra = isMain && subsOf(categories, c.id).length ? `,底下的 ${subsOf(categories, c.id).length} 個次類別也會一起刪除` : ''
    const msg = n > 0
      ? `「${c.name}」目前有 ${n} 筆資料使用中${extra},刪除後這些資料會變成未分類。確定刪除?`
      : `刪除${isMain ? '主' : '次'}類別「${c.name}」${extra}?`
    if (!confirm(msg)) return
    run(() => deleteCategory(c.id), '已刪除')
  }

  const EditRow = (c) => (
    <div className="flex flex-1 items-center gap-2">
      <input value={editName} onChange={(e) => setEditName(e.target.value)} className="input flex-1 py-1.5" autoFocus />
      <button onClick={() => setEditingId(null)} className="btn-secondary px-3 py-1.5 text-xs">取消</button>
      <button onClick={saveEdit} disabled={busy} className="btn-primary px-3 py-1.5 text-xs">儲存</button>
    </div>
  )

  return (
    <div className="card p-4">
      <div className="flex rounded-xl bg-surface-2 p-1">
        {KINDS.map((k) => (
          <button key={k.key} onClick={() => { setKind(k.key); setEditingId(null) }} className={`flex-1 rounded-lg py-1.5 text-sm font-medium ${kind === k.key ? 'bg-surface text-primary shadow-sm' : 'text-muted'}`}>
            {k.label}
          </button>
        ))}
      </div>

      <div className="mt-3 space-y-3">
        {mains.length === 0 && <p className="py-3 text-center text-sm text-muted">還沒有類別</p>}
        {mains.map((m) => {
          const subs = subsOf(categories, m.id)
          return (
            <div key={m.id} className="rounded-xl bg-surface-2 p-3">
              {/* 主類別 */}
              <div className="flex items-center gap-2">
                {editingId === m.id ? EditRow(m) : (
                  <>
                    <p className="min-w-0 flex-1 truncate font-semibold text-ink">{m.name}</p>
                    <span className="shrink-0 text-xs text-muted">{usage(m)} 筆</span>
                    <button onClick={() => { setEditingId(m.id); setEditName(m.name) }} className="chip shrink-0 px-2.5 py-1 text-xs">改名</button>
                    <button onClick={() => remove(m, true)} disabled={busy} className="chip shrink-0 px-2.5 py-1 text-xs text-danger">刪除</button>
                  </>
                )}
              </div>
              {/* 次類別 */}
              <div className="mt-2 flex flex-wrap gap-2">
                {subs.map((s) =>
                  editingId === s.id ? (
                    <div key={s.id} className="flex w-full items-center gap-2">{EditRow(s)}</div>
                  ) : (
                    <span key={s.id} className="chip gap-1 py-1 pr-1 text-xs">
                      <button type="button" onClick={() => { setEditingId(s.id); setEditName(s.name) }}>{s.name}</button>
                      <button type="button" aria-label="刪除" onClick={() => remove(s, false)} className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-surface text-[10px] text-muted">✕</button>
                    </span>
                  ),
                )}
                {subs.length === 0 && <span className="text-xs text-muted">尚無次類別</span>}
              </div>
              <form onSubmit={(e) => { e.preventDefault(); addSub(m.id) }} className="mt-2 flex gap-2">
                <input
                  value={subInputs[m.id] || ''}
                  onChange={(e) => setSubInputs((s) => ({ ...s, [m.id]: e.target.value }))}
                  placeholder={`在「${m.name}」下新增次類別`}
                  className="input flex-1 py-1.5 text-sm"
                />
                <button type="submit" disabled={busy || !(subInputs[m.id] || '').trim()} className="btn-secondary shrink-0 px-3 py-1.5 text-xs">＋ 次類別</button>
              </form>
            </div>
          )
        })}
      </div>

      <form onSubmit={addMain} className="mt-3 flex gap-2 border-t border-line pt-3">
        <input value={newMain} onChange={(e) => setNewMain(e.target.value)} placeholder={`新增${kind === 'task' ? '任務' : '獎勵'}主類別`} className="input flex-1" />
        <button type="submit" disabled={busy || !newMain.trim()} className="btn-primary shrink-0 px-4 text-sm">新增</button>
      </form>
    </div>
  )
}
