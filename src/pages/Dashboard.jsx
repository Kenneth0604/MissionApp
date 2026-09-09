import { Link } from 'react-router-dom'
import { otherUser, useStore } from '../lib/store.jsx'
import TaskCard from '../components/TaskCard.jsx'

export default function Dashboard() {
  const { user, nameOf, tasks, redemptions, balanceOf, reservedOf } = useStore()
  const balance = balanceOf(user)
  const reserved = reservedOf(user)

  const todo = tasks.filter((t) => t.assigned_to === user && (t.status === 'pending' || t.status === 'rejected'))
  const toReview = tasks.filter((t) => t.created_by === user && t.status === 'submitted')
  const waitingOther = tasks.filter((t) => t.created_by === user && (t.status === 'pending' || t.status === 'rejected'))
  const toFulfill = redemptions.filter((d) => d.status === 'requested' && d.requested_by !== user)

  return (
    <div className="space-y-5">
      <section className="hero rounded-3xl p-5 text-white shadow-lg">
        <p className="text-sm text-white/80">我的積分</p>
        <p className="mt-1 text-5xl font-bold tabular-nums">{balance}</p>
        {reserved > 0 && <p className="mt-1 text-xs text-white/70">其中 {reserved} 點已申請兌換,待對方確認</p>}
        <div className="mt-4 flex gap-2">
          <Link to="/points" className="rounded-full bg-white/20 px-3 py-1 text-sm">積分明細</Link>
          <Link to="/rewards" className="rounded-full bg-white/20 px-3 py-1 text-sm">兌換獎勵</Link>
        </div>
      </section>

      <section className="grid grid-cols-3 gap-3">
        <Stat to="/tasks?tab=mine" label="待完成" value={todo.length} cls="text-warning" />
        <Stat to="/tasks?tab=assigned" label="待我審核" value={toReview.length} cls="text-info" />
        <Stat to="/redemptions" label="待確認兌換" value={toFulfill.length} cls="text-accent" />
      </section>

      <Link to="/tasks/new" className="flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-primary/40 py-3.5 font-semibold text-primary">
        <span className="text-xl leading-none">＋</span> 派新任務給 {nameOf(otherUser(user))}
      </Link>

      {toReview.length > 0 && (
        <Section title="等待我審核" count={toReview.length}>
          {toReview.map((t) => <TaskCard key={t.id} task={t} />)}
        </Section>
      )}

      {toFulfill.length > 0 && (
        <section>
          <h2 className="section-title">等待我確認交付 <span className="rounded-full bg-surface-2 px-2 text-xs text-muted">{toFulfill.length}</span></h2>
          <div className="space-y-2">
            {toFulfill.map((d) => (
              <Link key={d.id} to="/redemptions" className="card flex items-center justify-between p-4">
                <div>
                  <p className="font-semibold text-ink">🎁 {d.reward?.name ?? '獎勵'}</p>
                  <p className="text-xs text-muted">{nameOf(d.requested_by)} {d.source === 'task' ? '完成任務獲得' : '申請兌換'}</p>
                </div>
                <span className="text-sm text-primary">前往確認 →</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <Section title="我要完成的" count={todo.length} empty="目前沒有待完成的任務 🎉">
        {todo.map((t) => <TaskCard key={t.id} task={t} />)}
      </Section>

      {waitingOther.length > 0 && (
        <Section title="等待對方完成" count={waitingOther.length}>
          {waitingOther.map((t) => <TaskCard key={t.id} task={t} />)}
        </Section>
      )}
    </div>
  )
}

function Stat({ to, label, value, cls }) {
  return (
    <Link to={to} className="card p-3 text-center">
      <div className={`text-2xl font-bold tabular-nums ${cls}`}>{value}</div>
      <div className="mt-0.5 text-xs text-muted">{label}</div>
    </Link>
  )
}

function Section({ title, count, empty, children }) {
  const isEmpty = !children || (Array.isArray(children) && children.length === 0)
  return (
    <section>
      <h2 className="section-title">
        {title}
        {count > 0 && <span className="rounded-full bg-surface-2 px-2 text-xs text-muted">{count}</span>}
      </h2>
      {isEmpty ? <p className="empty">{empty}</p> : <div className="space-y-2">{children}</div>}
    </section>
  )
}
