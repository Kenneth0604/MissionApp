import { otherUser, useStore } from '../lib/store.jsx'
import { formatDateTime } from '../lib/format.js'

export default function Points() {
  const { user, ledger, balanceOf } = useStore()
  const mine = ledger.filter((l) => l.user_id === user)
  const other = otherUser(user)

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 gap-3">
        <div className="hero rounded-3xl p-4 text-white shadow">
          <p className="text-xs text-white/80">我的積分</p>
          <p className="mt-1 text-3xl font-bold tabular-nums">{balanceOf(user)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-muted">{other} 的積分</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-ink">{balanceOf(other)}</p>
        </div>
      </section>

      <section>
        <h2 className="section-title">積分明細</h2>
        {mine.length === 0 ? (
          <p className="empty">還沒有任何積分紀錄</p>
        ) : (
          <ul className="card divide-y divide-line overflow-hidden">
            {mine.map((l) => (
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
