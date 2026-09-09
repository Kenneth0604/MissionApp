import { Link, useSearchParams } from 'react-router-dom'
import { useStore } from '../lib/store.jsx'
import TaskCard from '../components/TaskCard.jsx'

const TABS = [
  { key: 'mine', label: '我要完成的' },
  { key: 'assigned', label: '我派出的' },
  { key: 'history', label: '歷史' },
]

export default function Tasks() {
  const { user, tasks } = useStore()
  const [params, setParams] = useSearchParams()
  const tab = TABS.some((t) => t.key === params.get('tab')) ? params.get('tab') : 'mine'

  const list = tasks.filter((t) => {
    if (tab === 'history') return t.status === 'approved'
    if (t.status === 'approved') return false
    return tab === 'mine' ? t.assigned_to === user : t.created_by === user
  })

  // 待審核 / 已退回排前面,再依更新時間
  const rank = { submitted: 0, rejected: 1, pending: 2, approved: 3 }
  const sorted = [...list].sort((a, b) => {
    if (tab === 'history') return b.updated_at.localeCompare(a.updated_at)
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status]
    if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
    if (a.due_date) return -1
    if (b.due_date) return 1
    return b.updated_at.localeCompare(a.updated_at)
  })

  return (
    <div className="space-y-4">
      <div className="flex rounded-2xl bg-slate-200 p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setParams({ tab: t.key })}
            className={`flex-1 rounded-xl py-2 text-sm font-medium transition ${
              tab === t.key ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {sorted.length === 0 ? (
        <p className="rounded-2xl bg-white p-8 text-center text-sm text-slate-400 ring-1 ring-slate-200">
          這裡沒有任務
        </p>
      ) : (
        <div className="space-y-2">
          {sorted.map((t) => <TaskCard key={t.id} task={t} />)}
        </div>
      )}

      <Link
        to="/tasks/new"
        aria-label="新任務"
        className="fixed bottom-24 right-5 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-3xl leading-none text-white shadow-lg active:scale-95"
      >
        ＋
      </Link>
    </div>
  )
}
