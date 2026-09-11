import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../lib/store.jsx'
import { useToast } from '../lib/toast.jsx'
import CategoryFilter from '../components/CategoryFilter.jsx'
import CategoryChip from '../components/CategoryChip.jsx'
import ImageGallery from '../components/ImageGallery.jsx'
import { matchesFilter } from '../lib/categories.js'

export default function Rewards() {
  const { user, nameOf, rewards, categoriesById, balanceOf, reservedOf, requestRedemption } = useStore()
  const toast = useToast()
  const [showInactive, setShowInactive] = useState(false)
  const [category, setCategory] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [expanded, setExpanded] = useState(null)

  const balance = balanceOf(user)
  const available = balance - reservedOf(user)
  const list = rewards.filter((r) => {
    if (!showInactive && !r.is_active) return false
    return matchesFilter(r, category, categoriesById)
  })

  async function onRequest(r) {
    if (!confirm(`申請兌換「${r.name}」,需 ${r.cost_points} 點?\n對方確認交付後才會扣點。`)) return
    setBusyId(r.id)
    try {
      await requestRedemption(r.id)
      toast.success('已送出兌換申請')
    } catch (err) {
      toast.error(err)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-4">
      <section className="hero flex items-center justify-between rounded-3xl p-4 text-white shadow">
        <div>
          <p className="text-xs text-white/80">可用積分</p>
          <p className="text-3xl font-bold tabular-nums">{available}</p>
          {available !== balance && <p className="text-xs text-white/70">餘額 {balance},已申請中 {balance - available}</p>}
        </div>
        <Link to="/rewards/new" className="rounded-full bg-white/20 px-3 py-1.5 text-sm font-medium">＋ 新增獎勵</Link>
      </section>

      <CategoryFilter kind="reward" value={category} onChange={setCategory} />

      <label className="flex items-center gap-2 text-xs text-muted">
        <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="accent-primary" />
        顯示已停用的獎勵
      </label>

      {list.length === 0 ? (
        <p className="empty py-8">
          {rewards.length === 0 ? (
            <>還沒有任何獎勵,<Link to="/rewards/new" className="text-primary underline">新增第一個</Link>吧。</>
          ) : '這個篩選條件下沒有獎勵'}
        </p>
      ) : (
        <div className="space-y-2">
          {list.map((r) => {
            const soldOut = r.stock === 0
            const affordable = available >= r.cost_points
            const canRequest = r.is_active && r.redeemable !== false && !soldOut && affordable
            const thumb = r.image_urls[0]
            const open = expanded === r.id
            return (
              <div key={r.id} className={`card p-4 ${!r.is_active ? 'opacity-60' : ''}`}>
                <div className="flex items-start gap-3">
                  {thumb && (
                    <button type="button" onClick={() => setExpanded(open ? null : r.id)} className="shrink-0">
                      <img src={thumb} alt="" className="h-16 w-16 rounded-xl object-cover ring-1 ring-line" loading="lazy" />
                    </button>
                  )}
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-ink">{r.name}</h3>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                      <CategoryChip category={r.category} />
                      <span>{r.stock === -1 ? '無限供應' : soldOut ? '已兌換完' : `剩 ${r.stock} 份`}</span>
                      <span>由 {nameOf(r.created_by)} 新增</span>
                      {!r.is_active && <span>已停用</span>}
                    </div>
                    {r.description && <p className="mt-1 text-sm text-muted">{r.description}</p>}
                  </div>
                  <div className="shrink-0 text-right">
                    {r.redeemable === false ? (
                      <div className="rounded-full bg-accent-soft px-2 py-1 text-xs font-medium text-info">僅任務獎勵</div>
                    ) : (
                      <>
                        <div className="text-xl font-bold text-primary tabular-nums">{r.cost_points}</div>
                        <div className="text-xs text-muted">點</div>
                      </>
                    )}
                  </div>
                </div>
                {open && r.image_urls.length > 0 && (
                  <div className="mt-3">
                    <ImageGallery urls={r.image_urls} />
                  </div>
                )}
                <div className="mt-3 flex gap-2">
                  {r.redeemable === false ? (
                    <p className="flex flex-1 items-center justify-center rounded-2xl bg-surface-2 py-2.5 text-sm text-muted">完成指定任務才能獲得</p>
                  ) : (
                    <button onClick={() => onRequest(r)} disabled={!canRequest || busyId === r.id} className="btn-primary flex-1 py-2.5 text-sm">
                      {soldOut ? '已兌換完' : !affordable ? `還差 ${r.cost_points - available} 點` : busyId === r.id ? '送出中…' : '申請兌換'}
                    </button>
                  )}
                  <Link to={`/rewards/${r.id}/edit`} className="btn-secondary py-2.5 text-sm">編輯</Link>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
