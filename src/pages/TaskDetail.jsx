import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { canHelp, isHelped, isReviewer, reviewerOf, useStore } from '../lib/store.jsx'
import { useToast } from '../lib/toast.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import RewardTag from '../components/RewardTag.jsx'
import ImageGallery from '../components/ImageGallery.jsx'
import CategoryChip from '../components/CategoryChip.jsx'
import PriorityBadge from '../components/PriorityBadge.jsx'
import { describeRecurrence, formatDate, formatDateTime, isOverdue } from '../lib/format.js'

export default function TaskDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { user, nameOf, tasks, submitTask, setTaskNote, approveTask, withdrawTask, rejectTask, deleteTask, stopRecurrence } = useStore()
  const task = tasks.find((t) => t.id === id)
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [choice, setChoice] = useState('')
  const [note, setNote] = useState(() => task?.note ?? '')
  const [editingNote, setEditingNote] = useState(false)

  if (!task) return <p className="text-muted">找不到這個任務(可能已被刪除)</p>

  const isAssignee = task.shared || task.assigned_to === user
  const isCreator = task.created_by === user
  const canSubmit = isAssignee && (task.status === 'pending' || task.status === 'rejected')
  const canHelpOut = canHelp(task, user)
  const needsChoice = (canSubmit || canHelpOut) && task.choices?.length > 0
  const canReview = isReviewer(task, user)
  const reviewer = reviewerOf(task)
  // 任一方都可編輯 / 刪除待完成或已退回的任務;待審核的要先由送出者撤回
  const canEdit = task.status === 'pending' || task.status === 'rejected'
  const canWithdraw = task.status === 'submitted' && task.completed_by === user
  const recurrence = describeRecurrence(task.recurrence_rule)
  const recurrenceActive = task.recurrence_rule && task.recurrence_rule.active !== false
  const helped = isHelped(task)
  const doubled = helped && task.reward_type === 'points'
  const isDailyTask = Boolean(task.recurrence_rule) // 每日任務:完成即核准,不需審核;每一期可寫當天說明

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

  function onSubmit() {
    if (needsChoice && !choice) return toast.error('請選一個選項')
    run(
      () => submitTask(task.id, choice || undefined, isDailyTask ? note : undefined),
      isDailyTask ? '已完成 ✓' : '已送出,等待審核',
    )
  }

  function onSaveNote() {
    run(async () => {
      await setTaskNote(task.id, note)
      setEditingNote(false)
    }, '說明已更新')
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
          {task.chosen_choice && <Item label="這次選的" value={task.chosen_choice} />}
          <Item label="優先程度" value={<PriorityBadge value={task.priority} />} />
          <Item
            label="完成獎勵"
            value={
              <span className="flex items-center gap-1.5">
                <RewardTag task={task} size="lg" />
                {doubled && <span className="rounded-full bg-warning-soft px-1.5 py-0.5 text-xs font-bold text-warning">×2 幫忙</span>}
              </span>
            }
          />
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

        {(task.note || (isDailyTask && (task.status === 'submitted' || task.status === 'approved'))) && (
          <div className="mt-4 rounded-xl bg-surface-2 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-ink">📝 這一期的說明</span>
              {isDailyTask && !editingNote && (
                <button type="button" onClick={() => { setNote(task.note ?? ''); setEditingNote(true) }} className="text-xs text-primary">✎ 修改</button>
              )}
            </div>
            {editingNote ? (
              <div className="mt-2 space-y-2">
                <textarea autoFocus rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="今天做了什麼、練了多久…" className="input" />
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setEditingNote(false)} className="btn-secondary py-2 text-sm">取消</button>
                  <button type="button" onClick={onSaveNote} disabled={busy} className="btn-primary py-2 text-sm">儲存</button>
                </div>
              </div>
            ) : (
              <p className="mt-1 whitespace-pre-wrap text-ink/90">{task.note || <span className="text-muted">還沒有寫說明</span>}</p>
            )}
          </div>
        )}
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
            已核准,獎勵「{task.reward?.name}」已列入 <Link to="/rewards?tab=redeem" className="underline">兌換管理</Link> 待交付。
          </div>
        )}
        {canHelpOut && (
          <div className="mt-4 rounded-xl bg-warning-soft p-3 text-sm text-warning">
            這本來是 {nameOf(task.assigned_to)} 的任務。你可以幫忙完成,{task.reward_type === 'points' ? '積分獎勵會加倍發放給你' : '完成獎勵會發給你'}。
          </div>
        )}
      </section>

      {needsChoice && (canSubmit || canHelpOut) && (
        <div className="card space-y-2 p-4">
          <p className="label">選一個做了的</p>
          <div className="flex flex-wrap gap-2">
            {task.choices.map((c) => (
              <button key={c} type="button" onClick={() => setChoice(c)} className={`chip py-2 ${choice === c ? 'chip-active' : ''}`}>
                {c}
              </button>
            ))}
          </div>
        </div>
      )}

      {isDailyTask && (canSubmit || canHelpOut) && (
        <div className="card space-y-2 p-4">
          <p className="label">今天的說明(選填)</p>
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="例如:練了 30 分鐘音階" className="input" />
        </div>
      )}

      {canSubmit && (
        <button onClick={onSubmit} disabled={busy || (needsChoice && !choice)} className="btn-success w-full py-3.5 text-lg">
          ✓ {isDailyTask ? '完成(不需審核)' : '標記完成'}{choice && ` · ${choice}`}
        </button>
      )}

      {!canSubmit && canHelpOut && (
        <button onClick={onSubmit} disabled={busy || (needsChoice && !choice)} className="w-full rounded-2xl bg-warning py-3.5 text-lg font-semibold text-white disabled:opacity-40">
          🤝 幫忙完成(雙倍獎勵){choice && ` · ${choice}`}
        </button>
      )}

      {canReview && !rejecting && (
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => setRejecting(true)} disabled={busy} className="btn-danger-outline py-3.5">退回重做</button>
          <button onClick={() => run(() => approveTask(task.id), '已核准')} disabled={busy} className="btn-success py-3.5">
            核准{task.reward_type === 'points' ? ` +${doubled ? task.reward_points * 2 : task.reward_points}` : task.reward_type === 'reward' ? ` · ${task.reward?.name ?? '獎勵'}` : ''}
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

      {canWithdraw && (
        <button
          onClick={() => confirm('撤回後任務回到「待完成」,可以再編輯或重新標記完成。確定?') && run(() => withdrawTask(task.id), '已撤回,任務回到待完成')}
          disabled={busy}
          className="btn-secondary w-full"
        >
          ↩ 撤回審核
        </button>
      )}

      {(canEdit || recurrenceActive) && (
        <div className="flex flex-wrap gap-2 text-sm">
          {canEdit && (
            <>
              <Link to={task.recurrence_rule ? `/daily/${task.id}/edit` : `/tasks/${task.id}/edit`} className="chip">編輯</Link>
              <button onClick={onDelete} disabled={busy} className="chip text-danger">刪除</button>
            </>
          )}
          {recurrenceActive && (
            <button
              onClick={() => confirm('停用後,這個系列不會再產生下一期(所有進行中的期別一起停用)。確定?') && run(() => stopRecurrence(task.id), '已停用重複')}
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
