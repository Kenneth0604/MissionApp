import { useState } from 'react'
import { Link } from 'react-router-dom'
import { isDaily, isReviewer, otherUser, useStore } from '../lib/store.jsx'
import TaskCard from '../components/TaskCard.jsx'
import { formatDateTime } from '../lib/format.js'
import TaskFilter, { EMPTY_FILTER, matchTask, sortBySearch } from '../components/TaskFilter.jsx'
import TaskCalendar from '../components/TaskCalendar.jsx'

/** 對方區:看對方的積分、待完成任務(可從這裡進去幫忙完成)、每日任務與積分明細 */
export default function Partner() {
  const { user, nameOf, tasks, ledger, redemptions, balanceOf, reservedOf } = useStore()
  const other = otherUser(user)
  const name = nameOf(other)
  const [filter, setFilter] = useState(EMPTY_FILTER)
  const [view, setView] = useState('list')
  // 有搜尋字時維持搜尋分數的順序;否則依優先度、期限
  const byUrgency = (a, b) => (filter.q.trim() ? 0 : ((b.priority ?? 3) - (a.priority ?? 3) || (a.due_date || '9').localeCompare(b.due_date || '9')))

  const open = (t) => t.status === 'pending' || t.status === 'rejected'
  const visible = sortBySearch(tasks.filter((t) => matchTask(t, filter)), filter.q)
  const todo = visible.filter((t) => !isDaily(t) && !t.shared && t.assigned_to === other && open(t)).sort(byUrgency)
  const daily = visible.filter((t) => isDaily(t) && !t.shared && t.assigned_to === other && open(t)).sort(byUrgency)
  const submitted = visible.filter((t) => t.status === 'submitted' && t.completed_by === other)
  const done = visible.filter((t) => t.status === 'approved' && (t.completed_by ?? t.assigned_to) === other).slice(0, 5)
  const theirLedger = ledger.filter((l) => l.user_id === other).slice(0, 10)
  const pendingRedeem = redemptions.filter((d) => d.status === 'requested' && d.requested_by === other)

  return (
    <div className="space-y-5">
      <section className="hero rounded-3xl p-5 text-white shadow-lg">
        <p className="text-sm text-white/80">👤 {name} 的積分</p>
        <p className="mt-1 text-5xl font-bold tabular-nums">{balanceOf(other)}</p>
        {reservedOf(other) > 0 && <p className="mt-1 text-xs text-white/70">其中 {reservedOf(other)} 點已申請兌換,待你確認</p>}
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          <span className="rounded-full bg-white/20 px-3 py-1">待完成 {todo.length}</span>
          <span className="rounded-full bg-white/20 px-3 py-1">每日 {daily.length}</span>
          <span className="rounded-full bg-white/20 px-3 py-1">待審核 {submitted.length}</span>
          {pendingRedeem.length > 0 && <Link to="/rewards?tab=redeem" className="rounded-full bg-white/20 px-3 py-1">兌換申請 {pendingRedeem.length} →</Link>}
        </div>
      </section>

      <Link to="/tasks/new" className="flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-primary/40 py-3.5 font-semibold text-primary">
        <span className="text-xl leading-none">＋</span> 派新任務給 {name}
      </Link>

      <div className="flex items-start gap-2">
        <div className="flex-1"><TaskFilter value={filter} onChange={setFilter} /></div>
        <button type="button" onClick={() => setView(view === 'list' ? 'calendar' : 'list')} className={`chip shrink-0 py-2 ${view === 'calendar' ? 'chip-active' : ''}`}>
          {view === 'calendar' ? '☰ 列表' : '📆 日曆'}
        </button>
      </div>

      {view === 'calendar' ? (
        <TaskCalendar tasks={visible.filter((t) => !isDaily(t) && (t.shared || t.assigned_to === other))} />
      ) : (
      <>
      <Section title={`${name} 要完成的`} count={todo.length} empty={`${name} 目前沒有待完成的任務`} hint="點進去可以「幫忙完成」,積分會加倍給你">
        {todo.map((t) => <TaskCard key={t.id} task={t} />)}
      </Section>

      {daily.length > 0 && (
        <Section title={`${name} 的每日任務`} count={daily.length}>
          {daily.map((t) => <TaskCard key={t.id} task={t} />)}
        </Section>
      )}

      {submitted.length > 0 && (
        <Section title={`${name} 等待審核`} count={submitted.length} hint={submitted.some((t) => isReviewer(t, user)) ? '由你審核' : ''}>
          {submitted.map((t) => <TaskCard key={t.id} task={t} />)}
        </Section>
      )}

      {done.length > 0 && (
        <Section title="最近完成" count={done.length}>
          {done.map((t) => <TaskCard key={t.id} task={t} />)}
        </Section>
      )}
      </>
      )}

      <section>
        <h2 className="section-title">{name} 的積分明細</h2>
        {theirLedger.length === 0 ? (
          <p className="empty">還沒有任何積分紀錄</p>
        ) : (
          <ul className="card divide-y divide-line overflow-hidden">
            {theirLedger.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink">{l.reason}</p>
                  <p className="text-xs text-muted">{formatDateTime(l.created_at)}</p>
                </div>
                <span className={`shrink-0 font-bold tabular-nums ${l.amount >= 0 ? 'text-success' : 'text-danger'}`}>
                  {l.amount >= 0 ? '+' : ''}{l.amount}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function Section({ title, count, empty, hint, children }) {
  const isEmpty = !children || (Array.isArray(children) && children.length === 0)
  return (
    <section>
      <h2 className="section-title">
        {title}
        {count > 0 && <span className="rounded-full bg-surface-2 px-2 text-xs text-muted">{count}</span>}
      </h2>
      {hint && !isEmpty && <p className="-mt-1 mb-2 text-xs text-muted">{hint}</p>}
      {isEmpty ? <p className="empty">{empty}</p> : <div className="space-y-2">{children}</div>}
    </section>
  )
}
