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
  const suffix = `${rule.expire_on_miss ? ' · 過期即丟' : ''}${rule.active === false ? '(已停用)' : ''}`
  if (rule.freq === 'daily') return `每天${suffix}`
  if (rule.freq === 'weekly') return `每週${WEEKDAYS[rule.day_of_week ?? 0]}${suffix}`
  return ''
}

/** App 的「今天」:凌晨 3 點才換日(與資料庫 app_today() 一致),回傳 YYYY-MM-DD */
export function appTodayISO() {
  const d = new Date(Date.now() - 3 * 60 * 60 * 1000)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function isOverdue(task) {
  if (!task.due_date || task.status === 'approved') return false
  return task.due_date < appTodayISO()
}
