import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { isDaily, isReviewer, useStore } from '../lib/store.jsx'
import TaskCard from '../components/TaskCard.jsx'
import TaskFilter, { EMPTY_FILTER, matchTask, sortBySearch } from '../components/TaskFilter.jsx'
import TaskCalendar from '../components/TaskCalendar.jsx'

const TABS = [
  { key: 'mine', label: '我要完成的' },
  { key: 'assigned', label: '我派出的' },
  { key: 'history', label: '歷史' },
]

export default function Tasks() {
  const { user, tasks } = useStore()
  const [params, setParams] = useSearchParams()
  const tab = TABS.some((t) => t.key === params.get('tab')) ? params.get('tab') : 'mine'
  const [filter, setFilter] = useState(EMPTY_FILTER)
  const view = params.get('view') === 'calendar' ? 'calendar' : 'list'
  const setView = (v) => setParams({ tab, view: v })

  // 週期性(每日 / 每週)任務改在「每日任務」區管理與顯示
  const list = tasks.filter((t) => {
    if (isDaily(t)) return false
    if (!matchTask(t, filter)) return false
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

  // 依優先程度排序(越急越前),同等級再看狀態、期限;待審核排最後(已經送出去,不用你動作)
  const rank = { rejected: 0, pending: 1, submitted: 2, approved: 3 }
  const sorted = sortBySearch([...list].sort((a, b) => {
    if (tab === 'history') return b.updated_at.localeCompare(a.updated_at)
    if ((b.priority ?? 3) !== (a.priority ?? 3)) return (b.priority ?? 3) - (a.priority ?? 3)
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status]
    if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
    if (a.due_date) return -1
    if (b.due_date) return 1
    return b.updated_at.localeCompare(a.updated_at)
  }), filter.q)

  return (
    <div className="space-y-4">
      {view === 'list' && (
      <div className="flex rounded-2xl bg-surface-2 p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setParams({ tab: t.key, view })}
            className={`flex-1 rounded-xl py-2 text-sm font-medium transition ${tab === t.key ? 'bg-surface text-primary shadow-sm' : 'text-muted'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      )}

      <div className="flex items-center gap-2">
        <div className="flex-1"><TaskFilter value={filter} onChange={setFilter} /></div>
        <button
          type="button"
          onClick={() => setView(view === 'list' ? 'calendar' : 'list')}
          className={`chip shrink-0 self-start py-2 ${view === 'calendar' ? 'chip-active' : ''}`}
          title="切換列表 / 日曆"
        >
          {view === 'calendar' ? '☰ 列表' : '📆 日曆'}
        </button>
      </div>

      <p className="text-center text-xs text-muted">
        每天 / 每週重複的任務在「<Link to="/daily" className="text-primary underline">每日任務</Link>」區。
      </p>

      {view === 'calendar' ? (
        <TaskCalendar tasks={sortBySearch(tasks.filter((t) => !isDaily(t) && (t.shared || t.assigned_to === user) && matchTask(t, filter)), filter.q)} />
      ) : sorted.length === 0 ? (
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
