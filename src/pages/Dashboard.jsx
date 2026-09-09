import { Link } from 'react-router-dom'
import { useStore } from '../lib/store.jsx'
import TaskCard from '../components/TaskCard.jsx'

export default function Dashboard() {
  const { user, tasks, balanceOf } = useStore()
  const balance = balanceOf(user)

  const todo = tasks.filter((t) => t.assigned_to === user && (t.status === 'pending' || t.status === 'rejected'))
  const toReview = tasks.filter((t) => t.created_by === user && t.status === 'submitted')
  const waitingOther = tasks.filter((t) => t.created_by === user && (t.status === 'pending' || t.status === 'rejected'))

  return (
    <div className="space-y-5">
      <section className="rounded-3xl bg-gradient-to-br from-indigo-600 to-violet-600 p-5 text-white shadow-lg">
        <p className="text-sm text-white/80">我的積分</p>
        <p className="mt-1 text-5xl font-bold tabular-nums">{balance}</p>
        <div className="mt-4 flex gap-2">
          <Link to="/points" className="rounded-full bg-white/20 px-3 py-1 text-sm">積分明細</Link>
          <Link to="/rewards" className="rounded-full bg-white/20 px-3 py-1 text-sm">兌換獎勵</Link>
        </div>
      </section>

      <section className="grid grid-cols-3 gap-3">
        <Stat to="/tasks?tab=mine" label="待完成" value={todo.length} tone="amber" />
        <Stat to="/tasks?tab=assigned" label="待我審核" value={toReview.length} tone="sky" />
        <Stat to="/rewards" label="待確認兌換" value={0} tone="violet" />
      </section>

      <Link
        to="/tasks/new"
        className="flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-indigo-300 py-3.5 font-semibold text-indigo-600"
      >
        <span className="text-xl leading-none">＋</span> 派新任務給 {user === 'A' ? 'B' : 'A'}
      </Link>

      {toReview.length > 0 && (
        <Section title="等待我審核" count={toReview.length}>
          {toReview.map((t) => <TaskCard key={t.id} task={t} />)}
        </Section>
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

function Stat({ to, label, value, tone }) {
  const tones = {
    amber: 'text-amber-600',
    sky: 'text-sky-600',
    violet: 'text-violet-600',
  }
  return (
    <Link to={to} className="rounded-2xl bg-white p-3 text-center shadow-sm ring-1 ring-slate-200">
      <div className={`text-2xl font-bold tabular-nums ${tones[tone]}`}>{value}</div>
      <div className="mt-0.5 text-xs text-slate-500">{label}</div>
    </Link>
  )
}

function Section({ title, count, empty, children }) {
  const isEmpty = !children || (Array.isArray(children) && children.length === 0)
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
        {title}
        {count > 0 && <span className="rounded-full bg-slate-200 px-2 text-xs text-slate-600">{count}</span>}
      </h2>
      {isEmpty ? (
        <p className="rounded-2xl bg-white p-4 text-center text-sm text-slate-400 ring-1 ring-slate-200">{empty}</p>
      ) : (
        <div className="space-y-2">{children}</div>
      )}
    </section>
  )
}
