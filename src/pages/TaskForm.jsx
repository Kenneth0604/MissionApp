import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { otherUser, useStore } from '../lib/store.jsx'
import { useToast } from '../lib/toast.jsx'
import ImageUploader from '../components/ImageUploader.jsx'
import CategoryPicker from '../components/CategoryPicker.jsx'
import { mainsOf, matchesFilter, subsOf } from '../lib/categories.js'
import { DEFAULT_PRIORITY, PRIORITIES } from '../lib/priority.js'
import { appTodayISO } from '../lib/format.js'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

export default function TaskForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { user, nameOf, tasks, rewards, categories, categoriesById, createTask, updateTask } = useStore()
  const editing = id ? tasks.find((t) => t.id === id) : null
  const activeRewards = rewards.filter((r) => r.is_active && r.stock !== 0)
  // 指定獎勵:主類別 → 次類別(可略)→ 獎勵。只列出有可用獎勵的類別;沒分類的獎勵歸在「未分類」
  const rewardMains = [
    ...mainsOf(categories, 'reward').filter((c) => activeRewards.some((r) => matchesFilter(r, c.id, categoriesById))),
    ...(activeRewards.some((r) => !r.category_id) ? [{ id: 'none', name: '未分類' }] : []),
  ]
  const [rewardCat, setRewardCat] = useState(() => {
    const cur = editing?.reward_id ? rewards.find((r) => r.id === editing.reward_id) : null
    return cur ? cur.category_id || 'none' : ''
  })
  const rewardCatObj = rewardCat && rewardCat !== 'none' ? categoriesById[rewardCat] : null
  const rewardMainId = rewardCat === 'none' ? 'none' : rewardCatObj ? (rewardCatObj.parent_id || rewardCatObj.id) : ''
  const rewardSubs = rewardMainId && rewardMainId !== 'none'
    ? subsOf(categories, rewardMainId).filter((s) => activeRewards.some((r) => r.category_id === s.id))
    : []
  const rewardsInCat = activeRewards.filter((r) => matchesFilter(r, rewardCat, categoriesById))

  const [form, setForm] = useState(() => ({
    title: editing?.title ?? '',
    description: editing?.description ?? '',
    image_urls: editing?.image_urls ?? [],
    category_id: editing?.category_id ?? '',
    priority: editing?.priority ?? DEFAULT_PRIORITY,
    assigned_to: editing ? (editing.shared ? 'both' : editing.assigned_to) : otherUser(user),
    reward_type: editing?.reward_type ?? 'points',
    reward_points: editing?.reward_points ?? 10,
    reward_id: editing?.reward_id ?? '',
    due_date: editing?.due_date ?? '',
    freq: editing?.recurrence_rule?.freq ?? 'none',
    day_of_week: editing?.recurrence_rule?.day_of_week ?? new Date().getDay(),
    expire_on_miss: editing?.recurrence_rule?.expire_on_miss ?? false,
  }))
  const [busy, setBusy] = useState(false)

  if (id && !editing) return <p className="text-muted">找不到這個任務</p>
  if (editing && (editing.created_by !== user || editing.status !== 'pending')) {
    // 只有建立者能在待完成狀態編輯
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
        : {
            freq: form.freq,
            ...(form.freq === 'weekly' ? { day_of_week: Number(form.day_of_week) } : {}),
            active: true,
            expire_on_miss: Boolean(form.expire_on_miss),
          }

    // 過期即丟一定要有期限才知道哪一期算過期;沒填就用 App 的「今天」(凌晨 3 點換日)
    const due_date = form.due_date || (recurrence_rule?.expire_on_miss ? appTodayISO() : null)
    const payload = { ...form, recurrence_rule, reward_points: Number(form.reward_points), reward_id: form.reward_id || null, due_date }

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

      <Field label="優先程度">
        <div className="flex flex-wrap gap-2">
          {PRIORITIES.map((p) => (
            <button
              type="button"
              key={p.value}
              onClick={() => patch({ priority: p.value })}
              className={`chip py-2 ${form.priority === p.value ? 'chip-active' : p.cls}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </Field>

      <Field label="說明(選填)">
        <textarea value={form.description} onChange={set('description')} rows={3} className="input" placeholder="任務內容、注意事項…" />
      </Field>

      <Field label="圖片(選填)">
        <ImageUploader folder="tasks" value={form.image_urls} onChange={(urls) => patch({ image_urls: urls })} />
      </Field>

      <Field label="指派給">
        <div className="grid grid-cols-3 gap-2">
          {['A', 'B'].map((u) => (
            <button type="button" key={u} onClick={() => patch({ assigned_to: u })} className={`chip py-2.5 ${form.assigned_to === u ? 'chip-active' : ''}`}>
              {nameOf(u)}{u === user && '(自己)'}
            </button>
          ))}
          <button type="button" onClick={() => patch({ assigned_to: 'both' })} className={`chip py-2.5 ${form.assigned_to === 'both' ? 'chip-active' : ''}`}>
            👥 共同
          </button>
        </div>
        {form.assigned_to === 'both' && <p className="mt-1.5 text-xs text-muted">兩人都能標記完成,由另一人審核;有設獎勵的話發給完成的人。</p>}
      </Field>

      <Field label="完成獎勵">
        <div className="grid grid-cols-3 gap-2">
          <button type="button" onClick={() => patch({ reward_type: 'points' })} className={`chip py-2.5 ${form.reward_type === 'points' ? 'chip-active' : ''}`}>
            積分
          </button>
          <button type="button" onClick={() => patch({ reward_type: 'reward' })} className={`chip py-2.5 ${form.reward_type === 'reward' ? 'chip-active' : ''}`}>
            指定獎勵
          </button>
          <button type="button" onClick={() => patch({ reward_type: 'none' })} className={`chip py-2.5 ${form.reward_type === 'none' ? 'chip-active' : ''}`}>
            無獎勵
          </button>
        </div>
        {form.reward_type === 'none' ? (
          <p className="mt-2 text-xs text-muted">核准後不會發放任何積分或獎勵。</p>
        ) : form.reward_type === 'points' ? (
          <div className="mt-2 flex items-center gap-2">
            <input type="number" min="0" inputMode="numeric" value={form.reward_points} onChange={set('reward_points')} className="input" />
            <span className="shrink-0 text-sm text-muted">點</span>
          </div>
        ) : activeRewards.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            獎勵目錄還沒有可用的獎勵,<Link to="/rewards/new" className="text-primary underline">先新增一個</Link>。
          </p>
        ) : (
          <div className="mt-3 space-y-3 rounded-2xl bg-surface-2 p-3">
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted">1. 主類別</p>
              <div className="flex flex-wrap gap-2">
                {rewardMains.map((c) => (
                  <button
                    type="button"
                    key={c.id}
                    onClick={() => { setRewardCat(c.id); patch({ reward_id: '' }) }}
                    className={`chip py-2 ${rewardMainId === c.id ? 'chip-active' : ''}`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
            {rewardSubs.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted">2. 次類別</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => { setRewardCat(rewardMainId); patch({ reward_id: '' }) }} className={`chip py-2 ${rewardCat === rewardMainId ? 'bg-accent text-white ring-accent' : ''}`}>
                    全部
                  </button>
                  {rewardSubs.map((s) => (
                    <button type="button" key={s.id} onClick={() => { setRewardCat(s.id); patch({ reward_id: '' }) }} className={`chip py-2 ${rewardCat === s.id ? 'bg-accent text-white ring-accent' : ''}`}>
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {rewardCat && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted">{rewardSubs.length > 0 ? '3.' : '2.'} 選獎勵</p>
                <div className="flex flex-wrap gap-2">
                  {rewardsInCat.map((r) => (
                    <button
                      type="button"
                      key={r.id}
                      onClick={() => patch({ reward_id: r.id })}
                      className={`chip py-2 ${form.reward_id === r.id ? 'bg-primary text-primary-fg ring-primary' : ''}`}
                    >
                      {r.name}{r.stock > 0 ? `(剩 ${r.stock})` : ''}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <p className="text-xs text-muted">核准後會直接產生一筆待交付的兌換,不需扣積分。</p>
          </div>
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
        {form.freq !== 'none' && (
          <div className="mt-3 rounded-xl bg-surface-2 p-3">
            <label className="flex items-start gap-2 text-sm text-ink">
              <input type="checkbox" checked={form.expire_on_miss} onChange={(e) => patch({ expire_on_miss: e.target.checked })} className="mt-0.5 accent-primary" />
              <span>
                <span className="font-medium">過期即丟</span>
                <span className="mt-0.5 block text-xs text-muted">
                  每天凌晨 3 點結算:到期沒完成的那一期會直接消失並換成新的一期;有完成的照常記進歷史。適合「練樂器」這類每天都要重來的習慣。
                </span>
              </span>
            </label>
            {!form.expire_on_miss && <p className="mt-2 text-xs text-muted">未勾選時:審核通過後才會產生下一期,沒做完的會一直留著。</p>}
            {form.expire_on_miss && !form.due_date && <p className="mt-2 text-xs text-muted">沒填期限的話,第一期的期限會自動設為今天。</p>}
          </div>
        )}
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
