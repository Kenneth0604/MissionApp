import { Link } from 'react-router-dom'
import StatusBadge from './StatusBadge.jsx'
import { describeRecurrence, formatDate, isOverdue } from '../lib/format.js'
import { useStore } from '../lib/store.jsx'

export default function TaskCard({ task }) {
  const { user } = useStore()
  const mine = task.assigned_to === user
  const overdue = isOverdue(task)
  const recurrence = describeRecurrence(task.recurrence_rule)

  return (
    <Link
      to={`/tasks/${task.id}`}
      className="block rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 transition active:scale-[0.99]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold text-slate-900">{task.title}</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            {mine ? `${task.created_by} 派給我` : `我派給 ${task.assigned_to}`}
            {recurrence && <span className="ml-2 text-indigo-600">↻ {recurrence}</span>}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-base font-bold text-indigo-600">+{task.reward_points}</div>
          <StatusBadge status={task.status} className="mt-1" />
        </div>
      </div>
      {(task.due_date || task.reject_reason) && (
        <div className="mt-2 flex flex-wrap gap-x-3 text-xs">
          {task.due_date && (
            <span className={overdue ? 'font-medium text-rose-600' : 'text-slate-500'}>
              期限 {formatDate(task.due_date)}{overdue && ' · 已逾期'}
            </span>
          )}
          {task.status === 'rejected' && task.reject_reason && (
            <span className="text-rose-600">退回原因:{task.reject_reason}</span>
          )}
        </div>
      )}
    </Link>
  )
}
