import { Link } from 'react-router-dom'
import StatusBadge from './StatusBadge.jsx'
import RewardTag from './RewardTag.jsx'
import CategoryChip from './CategoryChip.jsx'
import PriorityBadge from './PriorityBadge.jsx'
import { describeRecurrence, formatDate, isOverdue } from '../lib/format.js'
import { isHelped, useStore } from '../lib/store.jsx'

export default function TaskCard({ task }) {
  const { user, nameOf } = useStore()
  const mine = task.assigned_to === user
  const helped = isHelped(task)
  const who = task.shared
    ? `👥 共同任務${task.completed_by ? ` · ${nameOf(task.completed_by)} 完成` : ''}`
    : mine ? `${nameOf(task.created_by)} 派給我` : `我派給 ${nameOf(task.assigned_to)}`
  const overdue = isOverdue(task)
  const recurrence = describeRecurrence(task.recurrence_rule)
  const thumb = task.image_urls?.[0]

  return (
    <Link to={`/tasks/${task.id}`} className="card block p-4 transition active:scale-[0.99]">
      <div className="flex items-start gap-3">
        {thumb && <img src={thumb} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover ring-1 ring-line" loading="lazy" />}
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold text-ink">{task.title}</h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            <span>{who}</span>
            {helped && <span className="font-medium text-warning">🤝 {nameOf(task.completed_by)} 幫忙(×2)</span>}
            {task.chosen_choice && <span className="text-info">✓ {task.chosen_choice}</span>}
            {task.status !== 'approved' && <PriorityBadge value={task.priority} />}
            <CategoryChip category={task.category} />
            {recurrence && <span className="text-accent">↻ {recurrence}</span>}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <RewardTag task={task} />
          <div className="mt-1">
            <StatusBadge status={task.status} />
          </div>
        </div>
      </div>
      {task.note && <p className="mt-2 truncate text-xs text-ink/80">📝 {task.note}</p>}
      {(task.due_date || (task.status === 'rejected' && task.reject_reason)) && (
        <div className="mt-2 flex flex-wrap gap-x-3 text-xs">
          {task.due_date && (
            <span className={overdue ? 'font-medium text-danger' : 'text-muted'}>
              期限 {formatDate(task.due_date)}{overdue && ' · 已逾期'}
            </span>
          )}
          {task.status === 'rejected' && task.reject_reason && <span className="text-danger">退回原因:{task.reject_reason}</span>}
        </div>
      )}
    </Link>
  )
}
