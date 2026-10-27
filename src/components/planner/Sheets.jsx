import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createSpring, createVelocityTracker, prefersReducedMotion, project, rubberband } from '../../lib/spring.js'
import { DEFAULT_FLAG_TIME, PALETTE, orderedItems, scheduledIds, subsOfGroup } from '../../lib/planner.js'

// 底部面板:彈簧滑入、可以往下拖關閉(放手時依速度決定關或彈回),✕ 也會滑出再關
const OPEN = { damping: 1, response: 0.38 }
const SETTLE = { damping: 0.8, response: 0.3 }
const DISMISS = { damping: 1, response: 0.3 }

export function Sheet({ title, onClose, children }) {
  const panelRef = useRef(null)
  const scrimRef = useRef(null)
  const height = useRef(1)
  const closingRef = useRef(false)
  const reduced = useRef(prefersReducedMotion())
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const spring = useRef(null)
  if (!spring.current) {
    spring.current = createSpring({
      onUpdate: (y) => {
        if (panelRef.current) panelRef.current.style.transform = `translate3d(0, ${y}px, 0)`
        if (scrimRef.current) scrimRef.current.style.opacity = String(1 - Math.min(1, Math.max(0, y / height.current)))
      },
    })
  }

  const dismiss = (velocity = 0) => {
    if (closingRef.current) return
    closingRef.current = true
    if (reduced.current) return closeRef.current()
    height.current = panelRef.current?.offsetHeight || height.current
    spring.current.to(height.current, { ...DISMISS, velocity: Math.max(0, velocity), onRest: () => closeRef.current() })
  }

  useLayoutEffect(() => {
    const s = spring.current
    height.current = panelRef.current?.offsetHeight || window.innerHeight
    if (reduced.current) { s.set(0); return () => s.stop() }
    s.set(height.current)
    s.to(0, OPEN)
    return () => s.stop()
  }, [])

  useEffect(() => {
    const el = panelRef.current
    if (!el) return
    const tracker = createVelocityTracker()
    let g = null
    const onStart = (e) => {
      if (e.target.closest('input,textarea,select,[data-nodrag]')) return
      g = { startY: e.touches[0].clientY, scrollTop: el.scrollTop, decided: false, dragging: false }
      tracker.reset()
      tracker.add(g.startY, e.timeStamp)
    }
    const onMove = (e) => {
      if (!g || closingRef.current) return
      const y = e.touches[0].clientY
      if (!g.decided) {
        const dy = y - g.startY
        if (Math.abs(dy) < 6) return
        g.decided = true
        if (!(g.scrollTop <= 0 && dy > 0) && !spring.current.animating) { g = null; return }
        g.dragging = true
        spring.current.stop()
        g.origin = spring.current.value
        g.startY = y
      }
      e.preventDefault()
      tracker.add(y, e.timeStamp)
      const raw = g.origin + (y - g.startY)
      spring.current.set(raw < 0 ? rubberband(raw, height.current) : raw)
    }
    const onEnd = () => {
      if (!g) return
      const wasDragging = g.dragging
      g = null
      if (!wasDragging) return
      const v = tracker.velocity()
      if (spring.current.value + project(v) > height.current * 0.5 && v > -100) dismiss(v)
      else spring.current.to(0, { ...SETTLE, velocity: v })
    }
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd)
    el.addEventListener('touchcancel', onEnd)
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
    }
  }, [])

  return (
    // 高度與位置跟著 visualViewport(--app-h / --app-top),鍵盤彈出時底部面板會貼在鍵盤上方而不是被蓋住
    <div
      className="fixed inset-x-0 z-40 flex items-end justify-center pointer-events-none"
      style={{ top: 'var(--app-top, 0px)', height: 'var(--app-h, 100%)' }}
    >
      <div ref={scrimRef} className="absolute inset-0 bg-black/40" style={{ opacity: reduced.current ? 1 : 0 }} />
      <div
        ref={panelRef}
        className="pointer-events-auto relative max-h-[85%] w-full max-w-md space-y-4 overflow-y-auto overscroll-contain rounded-t-3xl p-5 pb-safe"
        style={{
          background: 'var(--t-bg)',
          transform: reduced.current ? 'none' : 'translate3d(0, 100%, 0)',
          willChange: 'transform',
          boxShadow: '0 -8px 30px rgba(0,0,0,0.12)',
        }}
      >
        <div className="-mt-2 mx-auto h-1 w-9 rounded-full" style={{ background: 'var(--t-muted)' }} />
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-ink">{title}</h3>
          <button onClick={() => dismiss()} className="px-2 text-muted active:scale-90 transition-transform" aria-label="關閉">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function MinutePicker({ value, onChange, options = [5, 10, 15, 20, 25, 30, 45], allowEmpty = false }) {
  const empty = value === '' || value == null
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {allowEmpty && (
        <button type="button" onClick={() => onChange('')} className={`chip py-1 text-xs ${empty ? 'chip-active' : ''}`}>
          不設
        </button>
      )}
      {options.map((m) => (
        <button key={m} type="button" onClick={() => onChange(m)} className={`chip py-1 text-xs ${!empty && Number(value) === m ? 'chip-active' : ''}`}>
          {m}
        </button>
      ))}
      <div className="w-20">
        <input
          type="number"
          min="1"
          className="input !px-2 !py-1 !text-sm"
          value={value ?? ''}
          placeholder={allowEmpty ? '—' : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
      <span className="text-xs text-muted">分鐘</span>
    </div>
  )
}

export function ItemSheet({ state, dispatch, id, onClose, onAppend }) {
  const item = state.items.find((it) => it.id === id)
  const group = state.groups.find((g) => g.id === item?.groupId)
  const [form, setForm] = useState({ groupName: group?.name ?? '', sub: item?.sub ?? '', title: item?.title ?? '', minutes: item?.minutes ?? '' })
  if (!item) return null
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v?.target ? v.target.value : v }))
  const target = state.groups.find((g) => g.name === form.groupName.trim())
  const subOptions = target ? subsOfGroup(state, target.id).filter(Boolean) : []
  const inSchedule = scheduledIds(state).has(item.id)

  const save = (e) => {
    e.preventDefault()
    dispatch({ type: 'updateItem', id, ...form })
    onClose()
  }

  return (
    <Sheet title="編輯小塊" onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">主類別</label>
            <input className="input" list="planner-groups" value={form.groupName} onChange={set('groupName')} />
            <datalist id="planner-groups">{state.groups.map((g) => <option key={g.id} value={g.name} />)}</datalist>
          </div>
          <div>
            <label className="label">次類別</label>
            <input className="input" list="planner-subs" value={form.sub} onChange={set('sub')} placeholder="(可空白)" />
            <datalist id="planner-subs">{subOptions.map((s) => <option key={s} value={s} />)}</datalist>
          </div>
        </div>
        <div>
          <label className="label">任務</label>
          <input className="input" value={form.title} onChange={set('title')} />
        </div>
        <div>
          <label className="label">預估時間(可不設)</label>
          <MinutePicker value={form.minutes} onChange={set('minutes')} allowEmpty />
        </div>
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            className="btn-danger-outline"
            onClick={() => {
              dispatch({ type: 'deleteItem', id })
              onClose()
            }}
          >
            刪除
          </button>
          {!inSchedule && (
            <button
              type="button"
              className="btn-secondary flex-1"
              onClick={() => {
                dispatch({ type: 'updateItem', id, ...form })
                onAppend({ type: 'item', itemId: id })
                onClose()
              }}
            >
              排到最後
            </button>
          )}
          <button className="btn-primary flex-1">儲存</button>
        </div>
      </form>
    </Sheet>
  )
}

export function GroupSheet({ state, dispatch, id, onClose }) {
  const group = state.groups.find((g) => g.id === id)
  const [name, setName] = useState(group?.name ?? '')
  const [color, setColor] = useState(group?.color ?? PALETTE[0])
  if (!group) return null
  const count = orderedItems(state, id).length

  return (
    <Sheet title="編輯主類別" onClose={onClose}>
      <div>
        <label className="label">名稱</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label className="label">顏色(次類別會自動用同色系的深淺)</label>
        <div className="flex flex-wrap gap-2">
          {PALETTE.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`h-9 w-9 rounded-full transition ${color === c ? 'scale-110 ring-4 ring-line' : ''}`}
              style={{ background: c }}
              aria-label={c}
            />
          ))}
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <button
          className="btn-danger-outline"
          onClick={() => {
            if (count && !confirm(`刪除「${group.name}」和底下 ${count} 個小塊?`)) return
            dispatch({ type: 'deleteGroup', id })
            onClose()
          }}
        >
          刪除
        </button>
        <button
          className="btn-primary flex-1"
          onClick={() => {
            dispatch({ type: 'updateGroup', id, patch: { name: name.trim() || group.name, color } })
            onClose()
          }}
        >
          儲存
        </button>
      </div>
    </Sheet>
  )
}

export function BreakSheet({ state, dispatch, id, onClose }) {
  const entry = state.schedule.find((e) => e.id === id)
  const [minutes, setMinutes] = useState(entry?.minutes ?? 5)
  if (!entry) return null
  return (
    <Sheet title="☕ 休息" onClose={onClose}>
      <MinutePicker value={minutes} onChange={setMinutes} options={[5, 10, 15, 20, 30]} />
      <div className="flex gap-2">
        <button
          className="btn-danger-outline"
          onClick={() => {
            dispatch({ type: 'remove', id })
            onClose()
          }}
        >
          移除
        </button>
        <button
          className="btn-primary flex-1"
          onClick={() => {
            dispatch({ type: 'updateEntry', id, patch: { minutes: Math.max(1, Number(minutes) || 5) } })
            onClose()
          }}
        >
          儲存
        </button>
      </div>
    </Sheet>
  )
}

export function FlagSheet({ state, dispatch, id, onClose }) {
  const entry = state.schedule.find((e) => e.id === id)
  const [time, setTime] = useState(entry?.time ?? DEFAULT_FLAG_TIME)
  if (!entry) return null
  const save = () => {
    dispatch({ type: 'updateEntry', id, patch: { time: time || entry.time } })
    onClose()
  }
  return (
    <Sheet title="🚩 時間點" onClose={onClose}>
      <p className="text-sm text-muted">
        排程走到這裡時對齊到這個時間,後面的區塊從這裡接著算。
        {!state.timed && ' 開啟「🕒 時間軸」後會顯示空檔或超時。'}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {['08:00', '12:00', '13:00', '18:00', '20:00'].map((t) => (
          <button key={t} type="button" onClick={() => setTime(t)} className={`chip py-1 text-xs tabular-nums ${time === t ? 'chip-active' : ''}`}>
            {t}
          </button>
        ))}
        <div className="w-[7.5rem]">
          <input type="time" className="input !px-2 !py-1 !text-sm" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2">
        <button
          className="btn-danger-outline"
          onClick={() => {
            dispatch({ type: 'remove', id })
            onClose()
          }}
        >
          移除
        </button>
        <button className="btn-primary flex-1" onClick={save}>
          儲存
        </button>
      </div>
    </Sheet>
  )
}

export function InterleaveSheet({ state, dispatch, onClose }) {
  const [breakEvery, setBreakEvery] = useState(3)
  const [breakMinutes, setBreakMinutes] = useState(5)
  const scheduled = scheduledIds(state)
  const left = state.items.filter((it) => !scheduled.has(it.id)).length
  const names = state.groups.filter((g) => orderedItems(state, g.id).some((it) => !scheduled.has(it.id))).map((g) => g.name)

  return (
    <Sheet title="🔀 自動穿插" onClose={onClose}>
      <p className="text-sm text-muted">
        把 {left} 個還沒排的小塊,依主類別輪流接到排程最後,同一個主類別裡的次類別也會輪流:
        <br />
        <span className="font-semibold text-ink">{names.length ? [...names, names[0]].join(' → ') + ' → …' : '沒有可排的小塊'}</span>
      </p>
      <div>
        <label className="label">每幾塊插一段休息</label>
        <div className="flex flex-wrap gap-1.5">
          {[0, 2, 3, 4, 5].map((n) => (
            <button key={n} onClick={() => setBreakEvery(n)} className={`chip py-1 text-xs ${breakEvery === n ? 'chip-active' : ''}`}>
              {n === 0 ? '不要休息' : `每 ${n} 塊`}
            </button>
          ))}
        </div>
      </div>
      {breakEvery > 0 && (
        <div>
          <label className="label">休息長度</label>
          <div className="flex flex-wrap gap-1.5">
            {[5, 10, 15].map((m) => (
              <button key={m} onClick={() => setBreakMinutes(m)} className={`chip py-1 text-xs ${breakMinutes === m ? 'chip-active' : ''}`}>
                {m} 分
              </button>
            ))}
          </div>
        </div>
      )}
      <button
        className="btn-primary w-full"
        disabled={!left}
        onClick={() => {
          dispatch({ type: 'interleave', opts: { breakEvery, breakMinutes } })
          onClose()
        }}
      >
        排進去
      </button>
    </Sheet>
  )
}
