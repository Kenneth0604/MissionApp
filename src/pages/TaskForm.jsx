import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { otherUser, useStore } from '../lib/store.jsx'
import { useToast } from '../lib/toast.jsx'
import ImageUploader from '../components/ImageUploader.jsx'
import CategoryPicker from '../components/CategoryPicker.jsx'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

export default function TaskForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { user, nameOf, tasks, rewards, createTask, updateTask } = useStore()
  const editing = id ? tasks.find((t) => t.id === id) : null
  const activeRewards = rewards.filter((r) => r.is_active && r.stock !== 0)

  const [form, setForm] = useState(() => ({
    title: editing?.title ?? '',
    description: editing?.description ?? '',
    image_urls: editing?.image_urls ?? [],
    category_id: editing?.category_id ?? '',
    assigned_to: editing?.assigned_to ?? otherUser(user),
    reward_type: editing?.reward_type ?? 'points',
    reward_points: editing?.reward_points ?? 10,
    reward_id: editing?.reward_id ?? '',
    due_date: editing?.due_date ?? '',
    freq: editing?.recurrence_rule?.freq ?? 'none',
    day_of_week: editing?.recurrence_rule?.day_of_week ?? new Date().getDay(),
  }))
  const [busy, setBusy] = useState(false)

  if (id && !editing) return <p className="text-muted">找不到這個任務</p>
  if (editing && (editing.created_by !== user || editing.status !== 'pending')) {
    return <p className="text-muted">只有建立者能在「待完成」狀態下編輯任務</p>
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const patch = (obj) => setForm((f) => ({ ...f, ...obj }))

  async function onSubmit(e) {
    e.preventDefault()
    if (!form.title.trim()) return toast.error('請輸入任務標題')
    if (form.reward_type === 'points' && Number(form.reward_points) < 0) return toast.error('積分不能是負數')
    if (form.reward_type === 'reward' && !form.reward_id) return toast.error('請選擇一個獎勵')

    const recurrence_rule =
      form.freq === 'none'
        ? null
        : form.freq === 'daily'
          ? { freq: 'daily', active: true }
          : { freq: 'weekly', day_of_week: Number(form.day_of_week), active: true }

    const payload = { ...form, recurrence_rule, reward_points: Number(form.reward_points), reward_id: form.reward_id || null, due_date: form.due_date || null }

    setBusy(true)
    try {
      if (editing) {
        await updateTask(editing.id, payload)
        navigate(`/tasks/${editing.id}`, { replace: true })
      } else {
        const t = await createTask(payload)
        toast.success('任務已建立')
        navigate(`/tasks/${t.id}`, { replace: true })
      }
    } catch (err) {
      toast.error(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <h2 className="text-xl font-bold text-ink">{editing ? '編輯任務' : '新任務'}</h2>

      <Field label="標題">
        <input value={form.title} onChange={set('title')} placeholder="例如:倒垃圾" className="input" autoFocus={!editing} />
      </Field>

      <Field label="類別">
        <CategoryPicker kind="task" value={form.category_id} onChange={(v) => patch({ category_id: v })} />
      </Field>

      <Field label="說明(選填)">
        <textarea value={form.description} onChange={set('description')} rows={3} className="input" placeholder="任務內容、注意事項…" />
      </Field>

      <Field label="圖片(選填)">
        <ImageUploader folder="tasks" value={form.image_urls} onChange={(urls) => patch({ image_urls: urls })} />
      </Field>

      <Field label="指派給">
        <div className="grid grid-cols-2 gap-2">
          {['A', 'B'].map((u) => (
            <button type="button" key={u} onClick={() => patch({ assigned_to: u })} className={`chip py-2.5 ${form.assigned_to === u ? 'chip-active' : ''}`}>
              {nameOf(u)}{u === user && '(自己)'}
            </button>
          ))}
        </div>
      </Field>

      <Field label="完成獎勵">
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => patch({ reward_type: 'points' })} className={`chip py-2.5 ${form.reward_type === 'points' ? 'chip-active' : ''}`}>
            積分
          </button>
          <button type="button" onClick={() => patch({ reward_type: 'reward' })} className={`chip py-2.5 ${form.reward_type === 'reward' ? 'chip-active' : ''}`}>
            指定獎勵
          </button>
        </div>
        {form.reward_type === 'points' ? (
          <div className="mt-2 flex items-center gap-2">
            <input type="number" min="0" inputMode="numeric" value={form.reward_points} onChange={set('reward_points')} className="input" />
            <span className="shrink-0 text-sm text-muted">點</span>
          </div>
        ) : activeRewards.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            獎勵目錄還沒有可用的獎勵,<Link to="/rewards/new" className="text-primary underline">先新增一個</Link>。
          </p>
        ) : (
          <>
            <select value={form.reward_id} onChange={set('reward_id')} className="input mt-2">
              <option value="">選擇獎勵…</option>
              {activeRewards.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.category?.emoji ? `${r.category.emoji} ` : ''}{r.name}{r.stock > 0 ? `(剩 ${r.stock})` : ''}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-muted">核准後會直接產生一筆待交付的兌換,不需扣積分。</p>
          </>
        )}
      </Field>

      <Field label="期限(選填)">
        <input type="date" value={form.due_date} onChange={set('due_date')} className="input" />
      </Field>

      <Field label="重複">
        <div className="flex gap-2">
          {[['none', '不重複'], ['daily', '每天'], ['weekly', '每週']].map(([k, label]) => (
            <button type="button" key={k} onClick={() => patch({ freq: k })} className={`chip flex-1 ${form.freq === k ? 'chip-active' : ''}`}>
              {label}
            </button>
          ))}
        </div>
        {form.freq === 'weekly' && (
          <div className="mt-2 grid grid-cols-7 gap-1">
            {WEEKDAYS.map((d, i) => (
              <button
                type="button"
                key={i}
                onClick={() => patch({ day_of_week: i })}
                className={`rounded-lg py-2 text-sm ring-1 ${Number(form.day_of_week) === i ? 'bg-primary-soft text-primary ring-primary/40' : 'bg-surface text-muted ring-line'}`}
              >
                {d}
              </button>
            ))}
          </div>
        )}
        {form.freq !== 'none' && <p className="mt-2 text-xs text-muted">審核通過後才會自動產生下一期任務。</p>}
      </Field>

      <div className="flex gap-3 pt-2">
        <button type="button" onClick={() => navigate(-1)} className="btn-secondary flex-1">取消</button>
        <button type="submit" disabled={busy} className="btn-primary flex-1">{busy ? '儲存中…' : editing ? '儲存' : '建立任務'}</button>
      </div>
    </form>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <span className="label">{label}</span>
      {children}
    </div>
  )
}
