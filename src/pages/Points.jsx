import { useStore } from '../lib/store.jsx'
import { formatDateTime } from '../lib/format.js'

export default function Points() {
  const { user, ledger, balanceOf } = useStore()
  const mine = ledger.filter((l) => l.user_id === user)
  const other = user === 'A' ? 'B' : 'A'

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-3xl bg-indigo-600 p-4 text-white shadow">
          <p className="text-xs text-white/80">我的積分</p>
          <p className="mt-1 text-3xl font-bold tabular-nums">{balanceOf(user)}</p>
        </div>
        <div className="rounded-3xl bg-white p-4 ring-1 ring-slate-200">
          <p className="text-xs text-slate-500">{other} 的積分</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-slate-800">{balanceOf(other)}</p>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">積分明細</h2>
        {mine.length === 0 ? (
          <p className="rounded-2xl bg-white p-6 text-center text-sm text-slate-400 ring-1 ring-slate-200">還沒有任何積分紀錄</p>
        ) : (
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
            {mine.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm text-slate-800">{l.reason}</p>
                  <p className="text-xs text-slate-400">{formatDateTime(l.created_at)}</p>
                </div>
                <span className={`shrink-0 font-bold tabular-nums ${l.amount >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
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
