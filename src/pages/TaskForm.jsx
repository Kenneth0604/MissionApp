import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { otherUser, useStore } from '../lib/store.jsx'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

export default function TaskForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, tasks, createTask, updateTask } = useStore()
  const editing = id ? tasks.find((t) => t.id === id) : null

  const [form, setForm] = useState(() => ({
    title: editing?.title ?? '',
    description: editing?.description ?? '',
    assigned_to: editing?.assigned_to ?? otherUser(user),
    reward_points: editing?.reward_points ?? 10,
    due_date: editing?.due_date ?? '',
    freq: editing?.recurrence_rule?.freq ?? 'none',
    day_of_week: editing?.recurrence_rule?.day_of_week ?? new Date().getDay(),
  }))
  const [error, setError] = useState('')

  if (id && !editing) return <p className="text-slate-500">找不到這個任務</p>
  if (editing && (editing.created_by !== user || editing.status !== 'pending')) {
    return <p className="text-slate-500">只有建立者能在「待完成」狀態下編輯任務</p>
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  function onSubmit(e) {
    e.preventDefault()
    if (!form.title.trim()) return setError('請輸入任務標題')
    if (Number(form.reward_points) < 0) return setError('積分不能是負數')

    const recurrence_rule =
      form.freq === 'none'
        ? null
        : form.freq === 'daily'
          ? { freq: 'daily', active: true }
          : { freq: 'weekly', day_of_week: Number(form.day_of_week), active: true }

    const payload = {
      title: form.title,
      description: form.description,
      assigned_to: form.assigned_to,
      reward_points: Number(form.reward_points),
      due_date: form.due_date || null,
      recurrence_rule,
    }

    if (editing) {
      updateTask(editing.id, payload)
      navigate(`/tasks/${editing.id}`, { replace: true })
    } else {
      const t = createTask(payload)
      navigate(`/tasks/${t.id}`, { replace: true })
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <h2 className="text-xl font-bold text-slate-900">{editing ? '編輯任務' : '新任務'}</h2>

      <Field label="標題">
        <input value={form.title} onChange={set('title')} placeholder="例如:倒垃圾" className={inputCls} autoFocus />
      </Field>

      <Field label="說明(選填)">
        <textarea value={form.description} onChange={set('description')} rows={3} className={inputCls} />
      </Field>

      <Field label="指派給">
        <div className="grid grid-cols-2 gap-2">
          {['A', 'B'].map((u) => (
            <button
              type="button"
              key={u}
              onClick={() => setForm((f) => ({ ...f, assigned_to: u }))}
              className={`rounded-xl py-2.5 font-medium ring-1 ${
                form.assigned_to === u ? 'bg-indigo-600 text-white ring-indigo-600' : 'bg-white text-slate-700 ring-slate-300'
              }`}
            >
              {u}{u === user && '(自己)'}
            </button>
          ))}
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="獎勵積分">
          <input type="number" min="0" inputMode="numeric" value={form.reward_points} onChange={set('reward_points')} className={inputCls} />
        </Field>
        <Field label="期限(選填)">
          <input type="date" value={form.due_date} onChange={set('due_date')} className={inputCls} />
        </Field>
      </div>

      <Field label="重複">
        <div className="flex gap-2">
          {[
            ['none', '不重複'],
            ['daily', '每天'],
            ['weekly', '每週'],
          ].map(([k, label]) => (
            <button
              type="button"
              key={k}
              onClick={() => setForm((f) => ({ ...f, freq: k }))}
              className={`flex-1 rounded-xl py-2 text-sm font-medium ring-1 ${
                form.freq === k ? 'bg-indigo-600 text-white ring-indigo-600' : 'bg-white text-slate-700 ring-slate-300'
              }`}
            >
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
                onClick={() => setForm((f) => ({ ...f, day_of_week: i }))}
                className={`rounded-lg py-2 text-sm ring-1 ${
                  Number(form.day_of_week) === i ? 'bg-indigo-100 text-indigo-700 ring-indigo-300' : 'bg-white text-slate-600 ring-slate-200'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        )}
        {form.freq !== 'none' && (
          <p className="mt-2 text-xs text-slate-500">審核通過後才會自動產生下一期任務。</p>
        )}
      </Field>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <div className="flex gap-3 pt-2">
        <button type="button" onClick={() => navigate(-1)} className="flex-1 rounded-2xl bg-white py-3 font-medium text-slate-700 ring-1 ring-slate-300">
          取消
        </button>
        <button type="submit" className="flex-1 rounded-2xl bg-indigo-600 py-3 font-semibold text-white shadow">
          {editing ? '儲存' : '建立任務'}
        </button>
      </div>
    </form>
  )
}

const inputCls =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200'

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  )
}
