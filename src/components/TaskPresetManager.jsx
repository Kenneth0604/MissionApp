import { useState } from 'react'
import { useStore } from '../lib/store.jsx'
import { useToast } from '../lib/toast.jsx'
import CategoryPicker from './CategoryPicker.jsx'
import { PRIORITIES, DEFAULT_PRIORITY, priorityOf } from '../lib/priority.js'

const emptyForm = {
  title: '', category_id: '', priority: DEFAULT_PRIORITY, choices: [],
  reward_type: 'points', reward_points: 10, reward_id: '',
}

/** 設定頁:管理快捷任務(建立任務時可直接套用的範本) */
export default function TaskPresetManager() {
  const { presets, rewards, createPreset, updatePreset, deletePreset } = useStore()
  const toast = useToast()
  const activeRewards = rewards.filter((r) => r.is_active)
  const [editingId, setEditingId] = useState(null) // null = 沒在編輯;'new' = 新增中
  const [form, setForm] = useState(emptyForm)
  const [choiceInput, setChoiceInput] = useState('')
  const [busy, setBusy] = useState(false)

  const patch = (obj) => setForm((f) => ({ ...f, ...obj }))
  const startNew = () => { setForm(emptyForm); setChoiceInput(''); setEditingId('new') }
  const startEdit = (p) => {
    setForm({
      title: p.title, category_id: p.category_id ?? '', priority: p.priority,
      choices: p.choices ?? [], reward_type: p.reward_type, reward_points: p.reward_points, reward_id: p.reward_id ?? '',
    })
    setChoiceInput('')
    setEditingId(p.id)
  }

  function addChoice() {
    const v = choiceInput.trim()
    if (!v || form.choices.includes(v)) return
    patch({ choices: [...form.choices, v] })
    setChoiceInput('')
  }

  async function onSave(e) {
    e.preventDefault()
    if (!form.title.trim()) return toast.error('請輸入標題')
    if (form.reward_type === 'reward' && !form.reward_id) return toast.error('請選一個獎勵,或改成積分 / 無獎勵')
    setBusy(true)
    try {
      if (editingId === 'new') await createPreset(form)
      else await updatePreset(editingId, form)
      toast.success('已儲存')
      setEditingId(null)
    } catch (err) {
      toast.error(err)
    } finally {
      setBusy(false)
    }
  }

  function onDelete(p) {
    if (!confirm(`刪除快捷任務「${p.title}」?`)) return
    deletePreset(p.id).then(() => toast.info('已刪除')).catch((err) => toast.error(err))
  }

  return (
    <div className="card p-4">
      {presets.length === 0 && editingId === null && <p className="py-3 text-center text-sm text-muted">還沒有快捷任務</p>}

      {editingId === null && (
        <ul className="divide-y divide-line">
          {presets.map((p) => (
            <li key={p.id} className="flex items-center gap-2 py-2.5">
              <span className="text-lg">⚡</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{p.title}</p>
                <p className="truncate text-xs text-muted">
                  {p.category?.name ?? '未分類'} · {priorityOf(p.priority).label}
                  {p.reward_type === 'points' && p.reward_points > 0 && ` · +${p.reward_points} 積分`}
                  {p.reward_type === 'reward' && p.reward && ` · 🎁 ${p.reward.name}`}
                  {p.choices?.length > 0 && ` · 多選項 ${p.choices.length} 個`}
                </p>
              </div>
              <button onClick={() => startEdit(p)} className="chip shrink-0 px-2.5 py-1 text-xs">編輯</button>
              <button onClick={() => onDelete(p)} className="chip shrink-0 px-2.5 py-1 text-xs text-danger">刪除</button>
            </li>
          ))}
        </ul>
      )}

      {editingId === null ? (
        <button onClick={startNew} className="btn-secondary mt-3 w-full">＋ 新增快捷任務</button>
      ) : (
        <form onSubmit={onSave} className="mt-1 space-y-3 border-t border-line pt-3">
          <input value={form.title} onChange={(e) => patch({ title: e.target.value })} placeholder="標題,例如:倒垃圾" className="input" autoFocus />

          <CategoryPicker kind="task" value={form.category_id} onChange={(v) => patch({ category_id: v })} />

          <div className="flex flex-wrap gap-2">
            {PRIORITIES.map((pr) => (
              <button type="button" key={pr.value} onClick={() => patch({ priority: pr.value })} className={`chip py-1.5 text-sm ${form.priority === pr.value ? `${pr.solid} font-bold shadow` : pr.cls}`}>
                {pr.label}
              </button>
            ))}
          </div>

          <div>
            <div className="flex flex-wrap gap-2">
              {form.choices.map((c) => (
                <span key={c} className="chip gap-1.5 py-1 pr-1 text-sm">
                  {c}
                  <button type="button" aria-label="移除" onClick={() => patch({ choices: form.choices.filter((x) => x !== c) })} className="flex h-4 w-4 items-center justify-center rounded-full bg-surface-2 text-[9px] text-muted">✕</button>
                </span>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <input
                value={choiceInput}
                onChange={(e) => setChoiceInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addChoice() } }}
                placeholder="多選項(選填,例如:看書)"
                className="input flex-1 py-1.5 text-sm"
              />
              <button type="button" onClick={addChoice} className="btn-secondary shrink-0 px-3 py-1.5 text-xs">＋</button>
            </div>
          </div>

          <div className="flex gap-2">
            {[['points', '積分'], ['reward', '指定獎勵'], ['none', '無獎勵']].map(([k, label]) => (
              <button type="button" key={k} onClick={() => patch({ reward_type: k })} className={`chip flex-1 py-1.5 text-sm ${form.reward_type === k ? 'chip-active' : ''}`}>
                {label}
              </button>
            ))}
          </div>
          {form.reward_type === 'points' && (
            <div className="flex items-center gap-2">
              <input type="number" min="0" inputMode="numeric" value={form.reward_points} onChange={(e) => patch({ reward_points: e.target.value })} className="input" />
              <span className="shrink-0 text-sm text-muted">點</span>
            </div>
          )}
          {form.reward_type === 'reward' && (
            activeRewards.length === 0 ? (
              <p className="text-sm text-muted">獎勵目錄還沒有可用的獎勵。</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {activeRewards.map((r) => (
                  <button type="button" key={r.id} onClick={() => patch({ reward_id: r.id })} className={`chip py-1.5 text-sm ${form.reward_id === r.id ? 'bg-primary text-primary-fg ring-primary' : ''}`}>
                    {r.name}
                  </button>
                ))}
              </div>
            )
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={() => setEditingId(null)} className="btn-secondary flex-1">取消</button>
            <button type="submit" disabled={busy} className="btn-primary flex-1">{busy ? '儲存中…' : '儲存'}</button>
          </div>
        </form>
      )}
    </div>
  )
}
