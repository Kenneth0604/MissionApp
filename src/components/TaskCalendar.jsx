import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store.jsx'
import { appTodayISO } from '../lib/format.js'

const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六']
const COLORS = ['#e86aa8', '#a78bfa', '#16a37a', '#d98a1a', '#3b82f6', '#ef4444', '#0d9488', '#8b5cf6', '#f59e0b', '#64748b']

const DAY_W = 46 // 每天欄寬(px)
const PAST_DAYS = 60 // 今天往前可捲動的天數
const FUTURE_DAYS = 180 // 今天往後可捲動的天數
const TOTAL_DAYS = PAST_DAYS + FUTURE_DAYS + 1
const LONG_PRESS_MS = 380
const MOVE_CANCEL_PX = 8 // 按住期間移動超過這個距離就當作沒有要拖曳

const pad = (n) => String(n).padStart(2, '0')
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const parseISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const dateOf = (iso) => toISO(new Date(iso)) // 建立時間(ISO 字串)→ 本地日期 YYYY-MM-DD
/** 日期在整個可捲動範圍裡的第幾欄(0 起) */
const indexOf = (dayISO, rangeStartISO) => Math.round((parseISO(dayISO) - parseISO(rangeStartISO)) / 86400000)

/**
 * 週曆檢視:連續左右滑動(不分頁),任務標題放在建立日,有期限就從建立日拉一條線到期限日。
 * 相同(主)類別放在一起並用同一個顏色。長按任務可拖曳調整期限(未完成的任務才能拖)。
 */
export default function TaskCalendar({ tasks }) {
  const { setTaskDueDate } = useStore()
  const navigate = useNavigate()
  const today = appTodayISO()
  const rangeStart = useMemo(() => toISO(addDays(parseISO(today), -PAST_DAYS)), [today])
  const days = useMemo(() => Array.from({ length: TOTAL_DAYS }, (_, i) => toISO(addDays(parseISO(rangeStart), i))), [rangeStart])
  const todayIndex = PAST_DAYS

  const scrollRef = useRef(null)
  const [label, setLabel] = useState('')
  const updateLabel = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const startIdx = Math.round(el.scrollLeft / DAY_W)
    const endIdx = Math.min(TOTAL_DAYS - 1, startIdx + Math.round(el.clientWidth / DAY_W) - 1)
    const s = days[startIdx], e = days[endIdx]
    if (s && e) setLabel(`${Number(s.slice(5, 7))}/${Number(s.slice(8))} – ${Number(e.slice(5, 7))}/${Number(e.slice(8))}`)
  }, [days])

  const scrollToToday = useCallback((behavior = 'smooth') => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ left: todayIndex * DAY_W - el.clientWidth / 2 + DAY_W / 2, behavior })
  }, [todayIndex])

  useEffect(() => {
    scrollToToday('auto')
    const id = requestAnimationFrame(updateLabel)
    return () => cancelAnimationFrame(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const groups = useMemo(() => {
    const byGroup = new Map()
    for (const t of tasks) {
      const startISO = dateOf(t.created_at)
      const endISO = t.due_date && t.due_date > startISO ? t.due_date : startISO
      const colStart = Math.max(0, indexOf(startISO, rangeStart))
      const colEnd = Math.min(TOTAL_DAYS - 1, indexOf(endISO, rangeStart))
      if (colEnd < 0 || colStart > TOTAL_DAYS - 1) continue
      const main = t.category ? (t.category.parent ?? t.category) : null
      const key = main?.id ?? 'none'
      if (!byGroup.has(key)) byGroup.set(key, { key, name: main?.name ?? '未分類', items: [] })
      byGroup.get(key).items.push({ t, colStart, colEnd, startISO })
    }
    const list = [...byGroup.values()].sort((a, b) => (a.key === 'none') - (b.key === 'none') || a.name.localeCompare(b.name, 'zh-Hant'))
    list.forEach((g, i) => {
      g.color = COLORS[i % COLORS.length]
      g.items.sort((a, b) => (b.t.priority ?? 3) - (a.t.priority ?? 3) || a.colStart - b.colStart)
    })
    return list
  }, [tasks, rangeStart])

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <p className="text-sm font-semibold text-ink">{label}</p>
        <button onClick={() => scrollToToday()} className="text-xs text-primary">回到今天</button>
      </div>

      <div ref={scrollRef} onScroll={updateLabel} className="no-scrollbar card overflow-x-auto overflow-y-hidden" style={{ touchAction: 'pan-x' }}>
        <div className="relative" style={{ width: TOTAL_DAYS * DAY_W }}>
          {/* 今天的高亮直線 */}
          <div className="absolute inset-y-0 bg-primary/10" style={{ left: todayIndex * DAY_W, width: DAY_W }} />

          {/* 日期表頭 */}
          <div className="sticky top-0 z-10 flex border-b border-line bg-surface-2 text-center text-[10px]">
            {days.map((d, i) => (
              <div key={d} className={`shrink-0 border-l border-line/40 py-1.5 first:border-l-0 ${i === todayIndex ? 'font-bold text-primary' : 'text-muted'}`} style={{ width: DAY_W }}>
                <div>{WEEKDAY[parseISO(d).getDay()]}</div>
                <div className={`mx-auto mt-0.5 w-5 rounded-full leading-5 ${i === todayIndex ? 'bg-primary text-primary-fg' : ''}`}>{Number(d.slice(8))}</div>
              </div>
            ))}
          </div>

          {groups.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted" style={{ width: '100%' }}>沒有任務</p>
          ) : (
            groups.map((g) => (
              <div key={g.key} className="border-b border-line last:border-b-0">
                <div className="sticky left-0 z-10 flex w-fit items-center gap-1.5 bg-surface px-2 py-1 text-[11px] font-semibold text-muted">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: g.color }} />
                  {g.name}
                </div>
                {g.items.map((item) => (
                  <CalendarBar
                    key={item.t.id}
                    item={item}
                    color={g.color}
                    dayCount={days.length}
                    rangeStart={rangeStart}
                    onCommit={(due_date) => setTaskDueDate(item.t.id, due_date)}
                    onOpen={() => navigate(`/tasks/${item.t.id}`)}
                  />
                ))}
              </div>
            ))
          )}
        </div>
      </div>
      <p className="text-center text-[11px] text-muted">左右滑動看更多日期;長條從建立日拉到期限日。長按任務可拖曳調整期限,已完成的不能拖。</p>
    </div>
  )
}

/** 一條任務長條:一般點擊開啟詳情;長按(380ms)後可左右拖曳調整期限 */
function CalendarBar({ item, color, dayCount, rangeStart, onCommit, onOpen }) {
  const { t, colStart, colEnd } = item
  const draggable = t.status === 'pending' || t.status === 'rejected'
  const [dragDx, setDragDx] = useState(null) // null = 未拖曳;數字 = 拖曳中的像素位移
  const stateRef = useRef({ startX: 0, startY: 0, armed: false, moved: false, timer: null })

  const width = (colEnd - colStart + 1) * DAY_W
  const dayDelta = dragDx == null ? 0 : Math.round(dragDx / DAY_W)
  const previewEnd = Math.min(dayCount - 1, Math.max(colStart, colEnd + dayDelta))
  const previewStart = colStart // 起點(建立日)固定不動,拖曳改變的是期限那一端

  function clearTimer() {
    if (stateRef.current.timer) clearTimeout(stateRef.current.timer)
    stateRef.current.timer = null
  }

  function onPointerDown(e) {
    if (!draggable) return
    const s = stateRef.current
    s.startX = e.clientX
    s.startY = e.clientY
    s.armed = false
    s.moved = false
    clearTimer()
    s.timer = setTimeout(() => {
      s.armed = true
      setDragDx(0)
    }, LONG_PRESS_MS)
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  function onPointerMove(e) {
    const s = stateRef.current
    const dx = e.clientX - s.startX
    const dy = e.clientY - s.startY
    if (!s.armed) {
      if (Math.hypot(dx, dy) > MOVE_CANCEL_PX) { clearTimer(); s.moved = true }
      return
    }
    setDragDx(dx)
  }

  function onPointerUp() {
    const s = stateRef.current
    clearTimer()
    if (s.armed) {
      if (dayDelta !== 0) onCommit(toISO(addDays(parseISO(rangeStart), previewEnd)))
      setDragDx(null)
    } else if (!s.moved) {
      onOpen()
    }
    s.armed = false
    s.moved = false
  }

  return (
    <div className="relative h-8 landscape:h-9" style={{ width: dayCount * DAY_W }}>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { clearTimer(); setDragDx(null) }}
        title={t.title}
        style={{
          left: previewStart * DAY_W,
          width: dragDx != null ? (previewEnd - previewStart + 1) * DAY_W : width,
          minWidth: DAY_W,
          background: color,
          touchAction: draggable ? 'none' : 'pan-x',
        }}
        className={`absolute my-1 flex cursor-pointer items-center truncate rounded-full px-1.5 text-[11px] font-medium text-white shadow-sm landscape:px-2 landscape:text-sm ${
          dragDx != null ? 'ring-2 ring-white/80 shadow-lg' : ''
        } ${t.status === 'approved' ? 'opacity-45 line-through' : t.status === 'submitted' ? 'opacity-75' : ''}`}
      >
        <span className="truncate">{t.title}</span>
      </div>
    </div>
  )
}
