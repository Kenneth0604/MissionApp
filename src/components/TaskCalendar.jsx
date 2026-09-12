import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { appTodayISO } from '../lib/format.js'

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']
const COLORS = ['#e86aa8', '#a78bfa', '#16a37a', '#d98a1a', '#3b82f6', '#ef4444', '#0d9488', '#8b5cf6', '#f59e0b', '#64748b']

const pad = (n) => String(n).padStart(2, '0')
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const parseISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
/** 該週的星期一 */
const mondayOf = (d) => addDays(d, -((d.getDay() + 6) % 7))
/** 建立時間(ISO 字串)→ 本地日期 YYYY-MM-DD */
const dateOf = (iso) => toISO(new Date(iso))

/**
 * 週曆檢視:一到日七欄;任務標題放在建立日,有期限就從建立日拉一條線到期限日。
 * 相同(主)類別放在一起並用同一個顏色。
 */
export default function TaskCalendar({ tasks }) {
  const today = appTodayISO()
  const [weekStart, setWeekStart] = useState(() => mondayOf(parseISO(today)))
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => toISO(addDays(weekStart, i))), [weekStart])
  const first = days[0], last = days[6]

  const groups = useMemo(() => {
    const byGroup = new Map()
    for (const t of tasks) {
      const start = dateOf(t.created_at)
      const end = t.due_date && t.due_date > start ? t.due_date : start
      if (end < first || start > last) continue
      const colStart = Math.max(0, days.indexOf(start) === -1 ? (start < first ? 0 : 6) : days.indexOf(start))
      const colEnd = Math.min(6, days.indexOf(end) === -1 ? (end > last ? 6 : 0) : days.indexOf(end))
      const main = t.category ? (t.category.parent ?? t.category) : null
      const key = main?.id ?? 'none'
      if (!byGroup.has(key)) byGroup.set(key, { key, name: main?.name ?? '未分類', items: [] })
      byGroup.get(key).items.push({ t, colStart, colEnd, clipStart: start < first, clipEnd: end > last })
    }
    const list = [...byGroup.values()].sort((a, b) => (a.key === 'none') - (b.key === 'none') || a.name.localeCompare(b.name, 'zh-Hant'))
    list.forEach((g, i) => {
      g.color = COLORS[i % COLORS.length]
      g.items.sort((a, b) => (b.t.priority ?? 3) - (a.t.priority ?? 3) || a.colStart - b.colStart)
    })
    return list
  }, [tasks, days, first, last])

  const monthLabel = `${weekStart.getMonth() + 1}/${weekStart.getDate()} – ${addDays(weekStart, 6).getMonth() + 1}/${addDays(weekStart, 6).getDate()}`

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button onClick={() => setWeekStart((d) => addDays(d, -7))} className="chip px-3 py-1.5">‹</button>
        <div className="text-center">
          <p className="text-sm font-semibold text-ink">{monthLabel}</p>
          {!days.includes(today) && (
            <button onClick={() => setWeekStart(mondayOf(parseISO(today)))} className="text-xs text-primary">回到本週</button>
          )}
        </div>
        <button onClick={() => setWeekStart((d) => addDays(d, 7))} className="chip px-3 py-1.5">›</button>
      </div>

      <div className="card overflow-hidden">
        {/* 星期列 */}
        <div className="grid grid-cols-7 border-b border-line bg-surface-2 text-center text-[11px]">
          {days.map((d, i) => (
            <div key={d} className={`py-1.5 ${d === today ? 'font-bold text-primary' : 'text-muted'}`}>
              <div>{WEEKDAYS[i]}</div>
              <div className={`mx-auto mt-0.5 w-6 rounded-full leading-6 ${d === today ? 'bg-primary text-primary-fg' : ''}`}>{Number(d.slice(8))}</div>
            </div>
          ))}
        </div>

        {groups.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">這週沒有任務</p>
        ) : (
          groups.map((g) => (
            <div key={g.key} className="border-b border-line last:border-b-0">
              <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold text-muted">
                <span className="h-2 w-2 rounded-full" style={{ background: g.color }} />
                {g.name}
              </div>
              {g.items.map(({ t, colStart, colEnd, clipStart, clipEnd }) => (
                <div key={t.id} className="relative grid h-8 grid-cols-7">
                  {days.map((d) => (
                    <div key={d} className={`border-l border-line/60 first:border-l-0 ${d === today ? 'bg-primary/5' : ''}`} style={{ gridRow: 1 }} />
                  ))}
                  <Link
                    to={`/tasks/${t.id}`}
                    title={t.title}
                    style={{ gridRow: 1, gridColumn: `${colStart + 1} / ${colEnd + 2}`, background: g.color }}
                    className={`my-1 mx-0.5 flex min-w-0 items-center truncate px-1.5 text-[11px] font-medium text-white shadow-sm ${clipStart ? 'rounded-l-none' : 'rounded-l-full'} ${clipEnd ? 'rounded-r-none' : 'rounded-r-full'} ${t.status === 'approved' ? 'opacity-45 line-through' : t.status === 'submitted' ? 'opacity-75' : ''}`}
                  >
                    <span className="truncate">{t.title}</span>
                  </Link>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
      <p className="text-center text-[11px] text-muted">長條從建立日拉到期限日;沒有期限的只標在建立日。已完成的會變淡。</p>
    </div>
  )
}
