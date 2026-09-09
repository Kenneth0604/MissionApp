import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useStore } from '../lib/store.jsx'
import { useToast } from '../lib/toast.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import { formatDateTime } from '../lib/format.js'

const TABS = [
  { key: 'pending', label: '待處理' },
  { key: 'history', label: '歷史' },
]

export default function Redemptions() {
  const { user, redemptions, fulfillRedemption, rejectRedemption } = useStore()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'history' ? 'history' : 'pending'
  const [busyId, setBusyId] = useState(null)

  const list = redemptions.filter((d) => (tab === 'pending' ? d.status === 'requested' : d.status !== 'requested'))

  async function act(id, fn, ok) {
    setBusyId(id)
    try {
      await fn()
      toast.success(ok)
    } catch (err) {
      toast.error(err)
    } finally {
      setBusyId(null)
    }
  }

  function onFulfill(d) {
    const msg =
      d.cost_points > 0
        ? `確認已把「${d.reward?.name}」交給 ${d.requested_by}?\n將扣除 ${d.requested_by} ${d.cost_points} 點。`
        : `確認已把「${d.reward?.name}」交給 ${d.requested_by}?(任務獎勵,不扣點)`
    if (!confirm(msg)) return
    act(d.id, () => fulfillRedemption(d.id), '已確認交付')
  }

  function onReject(d) {
    const reason = prompt('拒絕原因(選填)') ?? null
    if (reason === null) return
    act(d.id, () => rejectRedemption(d.id, reason), '已拒絕')
  }

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

      {list.length === 0 ? (
        <p className="empty py-8">{tab === 'pending' ? '沒有待處理的兌換' : '還沒有歷史紀錄'}</p>
      ) : (
        <div className="space-y-2">
          {list.map((d) => {
            const mine = d.requested_by === user
            return (
              <div key={d.id} className="card p-4">
                <div className="flex items-start gap-3">
                  {d.reward?.image_urls?.[0] && (
                    <img src={d.reward.image_urls[0]} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover ring-1 ring-line" loading="lazy" />
                  )}
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-ink">🎁 {d.reward?.name ?? '獎勵'}</h3>
                    <p className="mt-0.5 text-xs text-muted">
                      {mine ? '我' : d.requested_by}
                      {d.source === 'task' ? `完成任務「${d.task?.title ?? ''}」獲得` : '申請兌換'}
                      {' · '}{formatDateTime(d.created_at)}
                    </p>
                    {d.status === 'rejected' && d.reject_reason && <p className="mt-1 text-xs text-danger">拒絕原因:{d.reject_reason}</p>}
                    {d.status === 'fulfilled' && d.fulfilled_at && (
                      <p className="mt-1 text-xs text-muted">由 {d.handled_by} 於 {formatDateTime(d.fulfilled_at)} 交付</p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <div className={`font-bold tabular-nums ${d.cost_points > 0 ? 'text-primary' : 'text-muted'}`}>
                      {d.cost_points > 0 ? `-${d.cost_points}` : '免費'}
                    </div>
                    <StatusBadge status={d.status} className="mt-1" />
                  </div>
                </div>

                {d.status === 'requested' &&
                  (mine ? (
                    <p className="mt-3 rounded-xl bg-info-soft p-2.5 text-xs text-info">等待對方交付後確認。</p>
                  ) : (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button onClick={() => onReject(d)} disabled={busyId === d.id} className="btn-danger-outline py-2.5 text-sm">拒絕</button>
                      <button onClick={() => onFulfill(d)} disabled={busyId === d.id} className="btn-success py-2.5 text-sm">
                        {busyId === d.id ? '處理中…' : '確認交付'}
                      </button>
                    </div>
                  ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
