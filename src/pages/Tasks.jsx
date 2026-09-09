import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { isReviewer, useStore } from '../lib/store.jsx'
import TaskCard from '../components/TaskCard.jsx'
import CategoryFilter from '../components/CategoryFilter.jsx'
import { matchesFilter } from '../lib/categories.js'

const TABS = [
  { key: 'mine', label: '我要完成的' },
  { key: 'assigned', label: '我派出的' },
  { key: 'history', label: '歷史' },
]

export default function Tasks() {
  const { user, tasks, categoriesById } = useStore()
  const [params, setParams] = useSearchParams()
  const tab = TABS.some((t) => t.key === params.get('tab')) ? params.get('tab') : 'mine'
  const [category, setCategory] = useState('')

  const list = tasks.filter((t) => {
    if (!matchesFilter(t, category, categoriesById)) return false
    if (tab === 'history') return t.status === 'approved'
    if (t.status === 'approved') return false
    if (tab === 'mine') {
      // 我要完成的:指派給我、或共同任務(還沒被對方完成送審的)
      if (t.shared) return t.status !== 'submitted' || t.completed_by === user
      return t.assigned_to === user
    }
    // 我派出的 / 待我審核的
    if (t.shared) return isReviewer(t, user)
    return t.created_by === user
  })

  const rank = { submitted: 0, rejected: 1, pending: 2, approved: 3 }
  const sorted = [...list].sort((a, b) => {
    if (tab === 'history') return b.updated_at.localeCompare(a.updated_at)
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status]
    if ((b.priority ?? 3) !== (a.priority ?? 3)) return (b.priority ?? 3) - (a.priority ?? 3) // 越急越前面
    if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
    if (a.due_date) return -1
    if (b.due_date) return 1
    return b.updated_at.localeCompare(a.updated_at)
  })

  return (
    <div className="space-y-4">
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
        <p className="empty py-8">這裡沒有任務</p>
      ) : (
        <div className="space-y-2">{sorted.map((t) => <TaskCard key={t.id} task={t} />)}</div>
      )}

      <Link
        to="/tasks/new"
        aria-label="新任務"
        className="fixed right-5 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] flex h-14 w-14 items-center justify-center rounded-full bg-primary text-3xl leading-none text-primary-fg shadow-lg active:scale-95"
      >
        ＋
      </Link>
    </div>
  )
}
