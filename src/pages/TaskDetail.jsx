import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { isReviewer, reviewerOf, useStore } from '../lib/store.jsx'
import { useToast } from '../lib/toast.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import RewardTag from '../components/RewardTag.jsx'
import ImageGallery from '../components/ImageGallery.jsx'
import CategoryChip from '../components/CategoryChip.jsx'
import { describeRecurrence, formatDate, formatDateTime, isOverdue } from '../lib/format.js'

export default function TaskDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { user, nameOf, tasks, submitTask, approveTask, rejectTask, deleteTask, stopRecurrence } = useStore()
  const task = tasks.find((t) => t.id === id)
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  if (!task) return <p className="text-muted">找不到這個任務(可能已被刪除)</p>

  const isAssignee = task.shared || task.assigned_to === user
  const isCreator = task.created_by === user
  const canSubmit = isAssignee && (task.status === 'pending' || task.status === 'rejected')
  const canReview = isReviewer(task, user)
  const reviewer = reviewerOf(task)
  const canEdit = isCreator && task.status === 'pending'
  const recurrence = describeRecurrence(task.recurrence_rule)
  const recurrenceActive = task.recurrence_rule && task.recurrence_rule.active !== false

  async function run(fn, okMsg) {
    setBusy(true)
    try {
      await fn()
      if (okMsg) toast.success(okMsg)
    } catch (err) {
      toast.error(err)
    } finally {
      setBusy(false)
    }
  }

  function onReject() {
    run(() => rejectTask(task.id, reason), '已退回')
    setRejecting(false)
    setReason('')
  }

  function onDelete() {
    if (!confirm('確定要刪除這個任務?')) return
    run(async () => {
      await deleteTask(task.id)
      navigate('/tasks', { replace: true })
    })
  }

  return (
    <div className="space-y-5">
      <button onClick={() => navigate(-1)} className="text-sm text-primary">← 返回</button>

      <section className="card p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-ink">{task.title}</h2>
            {task.category && <CategoryChip category={task.category} className="mt-1" />}
          </div>
          <StatusBadge status={task.status} />
        </div>
        {task.description && <p className="mt-3 whitespace-pre-wrap text-ink/90">{task.description}</p>}
        {task.image_urls.length > 0 && (
          <div className="mt-3">
            <ImageGallery urls={task.image_urls} />
          </div>
        )}

        <dl className="mt-4 grid grid-cols-2 gap-y-3 text-sm">
          <Item label="建立者" value={nameOf(task.created_by)} />
          <Item label="指派給" value={task.shared ? '👥 共同任務' : nameOf(task.assigned_to)} />
          {task.completed_by && <Item label="完成者" value={nameOf(task.completed_by)} />}
          <Item label="完成獎勵" value={<RewardTag task={task} size="lg" />} />
          <Item
            label="期限"
            value={
              task.due_date ? (
                <span className={isOverdue(task) ? 'font-medium text-danger' : ''}>
                  {formatDate(task.due_date)}{isOverdue(task) && ' · 已逾期'}
                </span>
              ) : '—'
            }
          />
          <Item label="重複" value={recurrence || '不重複'} />
          <Item label="最後更新" value={formatDateTime(task.updated_at)} />
        </dl>

        {task.status === 'rejected' && task.reject_reason && (
          <div className="mt-4 rounded-xl bg-danger-soft p-3 text-sm text-danger">
            <span className="font-semibold">退回原因:</span>{task.reject_reason}
          </div>
        )}
        {task.status === 'submitted' && !canReview && (
          <div className="mt-4 rounded-xl bg-info-soft p-3 text-sm text-info">已標記完成,等待 {reviewer ? nameOf(reviewer) : '對方'} 審核。</div>
        )}
        {task.status === 'approved' && task.reward_type === 'reward' && (
          <div className="mt-4 rounded-xl bg-success-soft p-3 text-sm text-success">
            已核准,獎勵「{task.reward?.name}」已列入 <Link to="/redemptions" className="underline">兌換管理</Link> 待交付。
          </div>
        )}
      </section>

      {canSubmit && (
        <button onClick={() => run(() => submitTask(task.id), '已送出,等待審核')} disabled={busy} className="btn-success w-full py-3.5 text-lg">
          ✓ 標記完成
        </button>
      )}

      {canReview && !rejecting && (
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => setRejecting(true)} disabled={busy} className="btn-danger-outline py-3.5">退回重做</button>
          <button onClick={() => run(() => approveTask(task.id), '已核准')} disabled={busy} className="btn-success py-3.5">
            核准{task.reward_type === 'points' ? ` +${task.reward_points}` : task.reward_type === 'reward' ? ` · ${task.reward?.name ?? '獎勵'}` : ''}
          </button>
        </div>
      )}
      {canReview && rejecting && (
        <div className="card space-y-3 p-4 ring-danger/30">
          <label className="label">退回原因</label>
          <textarea autoFocus rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="告訴對方哪裡需要修正" className="input" />
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => setRejecting(false)} className="btn-secondary">取消</button>
            <button onClick={onReject} disabled={busy} className="btn-danger">確認退回</button>
          </div>
        </div>
      )}

      {isCreator && (canEdit || recurrenceActive) && (
        <div className="flex flex-wrap gap-2 text-sm">
          {canEdit && (
            <>
              <Link to={`/tasks/${task.id}/edit`} className="chip">編輯</Link>
              <button onClick={onDelete} disabled={busy} className="chip text-danger">刪除</button>
            </>
          )}
          {recurrenceActive && (
            <button
              onClick={() => confirm('停用後,這個任務核准時不會再產生下一期。確定?') && run(() => stopRecurrence(task.id), '已停用重複')}
              disabled={busy}
              className="chip"
            >
              停用重複
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function Item({ label, value }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-ink">{value}</dd>
    </div>
  )
}
