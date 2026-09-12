import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { isDaily, isReviewer, useStore } from '../lib/store.jsx'
import TaskCard from '../components/TaskCard.jsx'
import CategoryFilter from '../components/CategoryFilter.jsx'
import { matchesFilter } from '../lib/categories.js'

const TABS = [
  { key: 'mine', label: '我要完成的' },
  { key: 'assigned', label: '我派出的' },
  { key: 'history', label: '歷史' },
]

/** 每日任務區:每天 / 每週重複的任務,獨立於一般任務列表 */
export default function DailyTasks() {
  const { user, tasks, categoriesById } = useStore()
  const [params, setParams] = useSearchParams()
  const tab = TABS.some((t) => t.key === params.get('tab')) ? params.get('tab') : 'mine'
  const [category, setCategory] = useState('')

  const list = tasks.filter((t) => {
    if (!isDaily(t)) return false
    if (!matchesFilter(t, category, categoriesById)) return false
    if (tab === 'history') return t.status === 'approved'
    if (t.status === 'approved') return false
    if (tab === 'mine') {
      if (t.shared) return t.status !== 'submitted' || t.completed_by === user
      return t.assigned_to === user
    }
    if (t.shared) return isReviewer(t, user)
    return t.created_by === user
  })

  const rank = { rejected: 0, pending: 1, submitted: 2, approved: 3 }
  const sorted = [...list].sort((a, b) => {
    if (tab === 'history') return b.updated_at.localeCompare(a.updated_at)
    if ((b.priority ?? 3) !== (a.priority ?? 3)) return (b.priority ?? 3) - (a.priority ?? 3) // 越急越前面
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status]
    return b.updated_at.localeCompare(a.updated_at)
  })

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-ink">📅 每日任務</h1>
      <p className="text-sm text-muted">每天 / 每週重複的習慣,例如練樂器、看書或運動。</p>

      <div className="flex rounded-2xl bg-surface-2 p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setParams({ tab: t.key })}
            className={`flex-1 rounded-xl py-2 text-sm font-medium transition ${tab === t.key ? 'bg-surface text-primary shadow-sm' : 'text-muted'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <CategoryFilter kind="task" value={category} onChange={setCategory} />

      {sorted.length === 0 ? (
        <p className="empty py-8">
          還沒有每日任務,<Link to="/daily/new" className="text-primary underline">新增第一個</Link>吧。
        </p>
      ) : (
        <div className="space-y-2">{sorted.map((t) => <TaskCard key={t.id} task={t} />)}</div>
      )}

      <Link
        to="/daily/new"
        aria-label="新增每日任務"
        className="fixed right-5 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] flex h-14 w-14 items-center justify-center rounded-full bg-primary text-3xl leading-none text-primary-fg shadow-lg active:scale-95"
      >
        ＋
      </Link>
    </div>
  )
}
