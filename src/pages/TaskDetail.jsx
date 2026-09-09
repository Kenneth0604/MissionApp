import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../lib/store.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import { describeRecurrence, formatDate, formatDateTime, isOverdue } from '../lib/format.js'

export default function TaskDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, tasks, submitTask, approveTask, rejectTask, deleteTask, stopRecurrence } = useStore()
  const task = tasks.find((t) => t.id === id)
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')

  if (!task) return <p className="text-slate-500">找不到這個任務</p>

  const isAssignee = task.assigned_to === user
  const isCreator = task.created_by === user
  const canSubmit = isAssignee && (task.status === 'pending' || task.status === 'rejected')
  const canReview = isCreator && task.status === 'submitted'
  const canEdit = isCreator && task.status === 'pending'
  const recurrence = describeRecurrence(task.recurrence_rule)
  const recurrenceActive = task.recurrence_rule && task.recurrence_rule.active !== false

  function onReject() {
    rejectTask(task.id, reason)
    setRejecting(false)
    setReason('')
  }

  function onDelete() {
    if (confirm('確定要刪除這個任務?')) {
      deleteTask(task.id)
      navigate('/tasks', { replace: true })
    }
  }

  return (
    <div className="space-y-5">
      <button onClick={() => navigate(-1)} className="text-sm text-indigo-600">← 返回</button>

      <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-xl font-bold text-slate-900">{task.title}</h2>
          <StatusBadge status={task.status} />
        </div>
        {task.description && <p className="mt-3 whitespace-pre-wrap text-slate-700">{task.description}</p>}

        <dl className="mt-4 grid grid-cols-2 gap-y-3 text-sm">
          <Item label="建立者" value={task.created_by} />
          <Item label="指派給" value={task.assigned_to} />
          <Item label="獎勵積分" value={<span className="font-bold text-indigo-600">+{task.reward_points}</span>} />
          <Item
            label="期限"
            value={
              task.due_date ? (
                <span className={isOverdue(task) ? 'font-medium text-rose-600' : ''}>
                  {formatDate(task.due_date)}{isOverdue(task) && ' · 已逾期'}
                </span>
              ) : '—'
            }
          />
          <Item label="重複" value={recurrence || '不重複'} />
          <Item label="最後更新" value={formatDateTime(task.updated_at)} />
        </dl>

        {task.status === 'rejected' && task.reject_reason && (
          <div className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">
            <span className="font-semibold">退回原因:</span>{task.reject_reason}
          </div>
        )}
        {task.status === 'submitted' && !canReview && (
          <div className="mt-4 rounded-xl bg-sky-50 p-3 text-sm text-sky-700">
            已標記完成,等待 {task.created_by} 審核。
          </div>
        )}
      </section>

      {/* 被指派者操作 */}
      {canSubmit && (
        <button
          onClick={() => submitTask(task.id)}
          className="w-full rounded-2xl bg-emerald-600 py-3.5 text-lg font-semibold text-white shadow"
        >
          ✓ 標記完成
        </button>
      )}

      {/* 建立者審核 */}
      {canReview && !rejecting && (
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => setRejecting(true)} className="rounded-2xl bg-white py-3.5 font-semibold text-rose-600 ring-1 ring-rose-300">
            退回重做
          </button>
          <button onClick={() => approveTask(task.id)} className="rounded-2xl bg-emerald-600 py-3.5 font-semibold text-white shadow">
            核准 +{task.reward_points}
          </button>
        </div>
      )}
      {canReview && rejecting && (
        <div className="space-y-3 rounded-3xl bg-white p-4 ring-1 ring-rose-200">
          <label className="block text-sm font-medium text-slate-700">退回原因</label>
          <textarea
            autoFocus
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="告訴對方哪裡需要修正"
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
          />
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => setRejecting(false)} className="rounded-2xl bg-white py-3 font-medium text-slate-700 ring-1 ring-slate-300">取消</button>
            <button onClick={onReject} className="rounded-2xl bg-rose-600 py-3 font-semibold text-white">確認退回</button>
          </div>
        </div>
      )}

      {/* 建立者管理 */}
      {isCreator && (canEdit || recurrenceActive) && (
        <div className="flex flex-wrap gap-2 text-sm">
          {canEdit && (
            <>
              <Link to={`/tasks/${task.id}/edit`} className="rounded-full bg-white px-4 py-2 text-slate-700 ring-1 ring-slate-300">編輯</Link>
              <button onClick={onDelete} className="rounded-full bg-white px-4 py-2 text-rose-600 ring-1 ring-slate-300">刪除</button>
            </>
          )}
          {recurrenceActive && (
            <button
              onClick={() => confirm('停用後,這個任務核准時不會再產生下一期。確定?') && stopRecurrence(task.id)}
              className="rounded-full bg-white px-4 py-2 text-slate-700 ring-1 ring-slate-300"
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
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-slate-800">{value}</dd>
    </div>
  )
}
