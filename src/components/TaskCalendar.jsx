import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store.jsx'
import { appTodayISO } from '../lib/format.js'

const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六']
const COLORS = ['#e86aa8', '#a78bfa', '#16a37a', '#d98a1a', '#3b82f6', '#ef4444', '#0d9488', '#8b5cf6', '#f59e0b', '#64748b']

const DEFAULT_DAY_W = 46 // 每天欄寬(px)預設值
const MIN_DAY_W = 26
const MAX_DAY_W = 100
const DEFAULT_ROW_H = 32 // 每列任務高度(px)預設值
const MIN_ROW_H = 20
const MAX_ROW_H = 64
// 兩指連線與水平線的夾角:< PINCH_LOCK_DEG 只縮欄寬,> 90-PINCH_LOCK_DEG 只縮列高,其間兩軸同時縮。
// 若不鎖軸,接近水平的捏合在 Y 方向只有幾十 px,手抖幾 px 就是列高 ±20% 的跳動,整張日曆會閃。
const PINCH_LOCK_DEG = 30
const MIN_PINCH_AXIS_DIST = 24 // 該軸起始距離小於此值仍不縮放,避免除以極小值
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
 * 兩指可以縮放:橫向調整每天欄寬,縱向調整每列高度,兩軸各自獨立。
 */
export default function TaskCalendar({ tasks }) {
  const { setTaskDueDate } = useStore()
  const navigate = useNavigate()
  const today = appTodayISO()
  const rangeStart = useMemo(() => toISO(addDays(parseISO(today), -PAST_DAYS)), [today])
  const days = useMemo(() => Array.from({ length: TOTAL_DAYS }, (_, i) => toISO(addDays(parseISO(rangeStart), i))), [rangeStart])
  const todayIndex = PAST_DAYS

  const [dayW, setDayW] = useState(DEFAULT_DAY_W)
  const [rowH, setRowH] = useState(DEFAULT_ROW_H)
  const scrollRef = useRef(null)
  const pointers = useRef(new Map()) // 目前按著的觸點(pinch 縮放用)
  const pinch = useRef(null)

  const [label, setLabel] = useState('')
  const updateLabel = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const startIdx = Math.round(el.scrollLeft / dayW)
    const endIdx = Math.min(TOTAL_DAYS - 1, startIdx + Math.round(el.clientWidth / dayW) - 1)
    const s = days[startIdx], e = days[endIdx]
    if (s && e) setLabel(`${Number(s.slice(5, 7))}/${Number(s.slice(8))} – ${Number(e.slice(5, 7))}/${Number(e.slice(8))}`)
  }, [days, dayW])

  const scrollToToday = useCallback((behavior = 'smooth') => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ left: todayIndex * dayW - el.clientWidth / 2 + dayW / 2, behavior })
  }, [todayIndex, dayW])

  useEffect(() => {
    scrollToToday('auto')
    const id = requestAnimationFrame(updateLabel)
    return () => cancelAnimationFrame(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---------- 兩指縮放:抓在 scroll 容器上,兩指才啟動,單指讓瀏覽器正常捲動 ----------
  // 水平距離(X)控制每天欄寬 dayW,垂直距離(Y)控制每列高度 rowH;按下時依兩指連線角度決定哪些軸參與,
  // 尺寸取整數 px,值沒變就不 setState、不修正 scrollLeft,避免每個 pointermove 都重繪。
  function onContainerPointerDown(e) {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2) {
      const [p1, p2] = [...pointers.current.values()]
      const rect = scrollRef.current.getBoundingClientRect()
      const startDistX = Math.abs(p2.x - p1.x)
      const startDistY = Math.abs(p2.y - p1.y)
      const angle = (Math.atan2(startDistY, startDistX) * 180) / Math.PI // 0 = 水平,90 = 垂直
      pinch.current = {
        startDistX,
        startDistY,
        useX: angle < 90 - PINCH_LOCK_DEG && startDistX >= MIN_PINCH_AXIS_DIST,
        useY: angle > PINCH_LOCK_DEG && startDistY >= MIN_PINCH_AXIS_DIST,
        startDayW: dayW,
        lastDayW: dayW,
        startRowH: rowH,
        startScrollLeft: scrollRef.current.scrollLeft,
        anchorX: (p1.x + p2.x) / 2 - rect.left,
      }
    }
  }
  function onContainerPointerMove(e) {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2 && pinch.current) {
      e.preventDefault()
      const [p1, p2] = [...pointers.current.values()]
      const p = pinch.current

      if (p.useX) {
        const scaleX = Math.abs(p2.x - p1.x) / p.startDistX
        const newDayW = Math.round(Math.min(MAX_DAY_W, Math.max(MIN_DAY_W, p.startDayW * scaleX)))
        if (newDayW !== p.lastDayW) {
          p.lastDayW = newDayW
          setDayW(newDayW)
          const dayIndex = (p.startScrollLeft + p.anchorX) / p.startDayW
          const el = scrollRef.current
          requestAnimationFrame(() => { if (el) el.scrollLeft = dayIndex * newDayW - p.anchorX })
        }
      }
      if (p.useY) {
        const scaleY = Math.abs(p2.y - p1.y) / p.startDistY
        setRowH(Math.round(Math.min(MAX_ROW_H, Math.max(MIN_ROW_H, p.startRowH * scaleY))))
      }
    }
  }
  function onContainerPointerUp(e) {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
  }

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

      {/* touchAction: pan-x pan-y(而非只 pan-x)— 才能讓拖動日曆時頁面仍可上下滑動;兩指縮放靠自己的 pointer 追蹤處理 */}
      <div
        ref={scrollRef}
        onScroll={updateLabel}
        onPointerDown={onContainerPointerDown}
        onPointerMove={onContainerPointerMove}
        onPointerUp={onContainerPointerUp}
        onPointerCancel={onContainerPointerUp}
        className="no-scrollbar card overflow-x-auto overflow-y-hidden"
        style={{ touchAction: 'pan-x pan-y' }}
      >
        <div className="relative" style={{ width: TOTAL_DAYS * dayW }}>
          {/* 今天的高亮直線 */}
          <div className="absolute inset-y-0 bg-primary/10" style={{ left: todayIndex * dayW, width: dayW }} />

          {/* 日期表頭 */}
          <div className="sticky top-0 z-10 flex border-b border-line bg-surface-2 text-center text-[10px]">
            {days.map((d, i) => (
              <div key={d} className={`shrink-0 border-l border-line/40 py-1.5 first:border-l-0 ${i === todayIndex ? 'font-bold text-primary' : 'text-muted'}`} style={{ width: dayW }}>
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
                    dayW={dayW}
                    rowH={rowH}
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
      <p className="text-center text-[11px] text-muted">左右滑動看更多日期,兩指橫向縮放可調整每天寬度、縱向縮放可調整每列高度;長條從建立日拉到期限日。長按任務可拖曳調整期限,已完成的不能拖。</p>
    </div>
  )
}

/** 一條任務長條:一般點擊開啟詳情;長按(380ms)後可左右拖曳調整期限 */
function CalendarBar({ item, color, dayCount, dayW, rowH, rangeStart, onCommit, onOpen }) {
  const { t, colStart, colEnd } = item
  const draggable = t.status === 'pending' || t.status === 'rejected'
  const [dragDx, setDragDx] = useState(null) // null = 未拖曳;數字 = 拖曳中的像素位移
  const stateRef = useRef({ startX: 0, startY: 0, armed: false, moved: false, timer: null })

  const width = (colEnd - colStart + 1) * dayW
  const dayDelta = dragDx == null ? 0 : Math.round(dragDx / dayW)
  const previewEnd = Math.min(dayCount - 1, Math.max(colStart, colEnd + dayDelta))
  const previewStart = colStart // 起點(建立日)固定不動,拖曳改變的是期限那一端

  function clearTimer() {
    if (stateRef.current.timer) clearTimeout(stateRef.current.timer)
    stateRef.current.timer = null
  }

  function onPointerDown(e) {
    if (!draggable || e.isPrimary === false) return // 兩指縮放時忽略,交給外層容器處理
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
    <div className="relative" style={{ width: dayCount * dayW, height: rowH }}>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { clearTimer(); setDragDx(null) }}
        title={t.title}
        style={{
          left: previewStart * dayW,
          width: dragDx != null ? (previewEnd - previewStart + 1) * dayW : width,
          minWidth: dayW,
          background: color,
          touchAction: draggable ? 'none' : 'pan-x pan-y',
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
