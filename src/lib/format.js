export function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })
}

export function formatDateTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

export function describeRecurrence(rule) {
  if (!rule) return ''
  const suffix = rule.active === false ? '(已停用)' : ''
  if (rule.freq === 'daily') return `每天${suffix}`
  if (rule.freq === 'weekly') return `每週${WEEKDAYS[rule.day_of_week ?? 0]}${suffix}`
  return ''
}

export function isOverdue(task) {
  if (!task.due_date || task.status === 'approved') return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return new Date(task.due_date) < today
}
