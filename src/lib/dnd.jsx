import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

/**
 * 輕量拖放(Pointer Events),同時支援滑鼠與手機:
 *  - 滑鼠:按下後移動 4px 開始拖
 *  - 觸控:長按 260ms 開始拖(避免和捲動衝突);按住 [data-handle] 則立即拖
 *  - [data-nodrag] 內的按鈕不會觸發拖曳
 * 放置區用 data-dropzone="名稱" 標記;其中的 [data-slot] 子元素用來計算插入位置
 * 拖曳時會自動捲動最近的 [data-scroll] 容器
 */
const DragContext = createContext(null)

function locate(x, y) {
  const el = document.elementFromPoint(x, y)
  const zoneEl = el?.closest('[data-dropzone]')
  if (!zoneEl) return { zone: null, index: -1, scrollEl: null }
  const slots = [...zoneEl.querySelectorAll('[data-slot]')]
  let index = slots.length
  for (let i = 0; i < slots.length; i++) {
    const r = slots[i].getBoundingClientRect()
    if (y < r.top + r.height / 2) {
      index = i
      break
    }
  }
  return { zone: zoneEl.dataset.dropzone, index, scrollEl: zoneEl.closest('[data-scroll]') ?? zoneEl.querySelector('[data-scroll]') }
}

export function DragProvider({ onDrop, renderGhost, children }) {
  const [drag, setDrag] = useState(null)
  const ref = useRef(null)
  const raf = useRef(0)
  const onDropRef = useRef(onDrop)
  onDropRef.current = onDrop

  const set = (next) => {
    ref.current = next
    setDrag(next)
  }

  const move = useCallback((x, y) => {
    if (!ref.current) return
    set({ ...ref.current, x, y, ...locate(x, y) })
  }, [])

  const tick = useCallback(() => {
    const d = ref.current
    if (!d) return
    const sc = d.scrollEl
    if (sc) {
      const r = sc.getBoundingClientRect()
      const edge = 56
      let dy = 0
      if (d.y < r.top + edge) dy = -Math.ceil((r.top + edge - d.y) / 4)
      else if (d.y > r.bottom - edge) dy = Math.ceil((d.y - (r.bottom - edge)) / 4)
      if (dy) {
        sc.scrollTop += dy
        move(d.x, d.y)
      }
    }
    raf.current = requestAnimationFrame(tick)
  }, [move])

  const finish = useCallback((drop) => {
    const d = ref.current
    cancelAnimationFrame(raf.current)
    set(null)
    // 拖完之後吃掉緊接著的 click,避免誤觸開啟編輯
    const stop = (e) => {
      e.stopPropagation()
      e.preventDefault()
    }
    window.addEventListener('click', stop, { capture: true, once: true })
    setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 80)
    if (drop && d) onDropRef.current?.({ payload: d.payload, zone: d.zone, index: d.index })
  }, [])

  // 拖曳中阻止觸控捲動(需 passive:false 才能 preventDefault)
  useEffect(() => {
    const h = (e) => {
      if (ref.current) e.preventDefault()
    }
    window.addEventListener('touchmove', h, { passive: false })
    return () => window.removeEventListener('touchmove', h)
  }, [])

  const bind = useCallback(
    (payload) => ({
      onContextMenu: (e) => e.preventDefault(),
      onPointerDown: (e) => {
        if (e.button !== 0 || ref.current) return
        if (e.target.closest('[data-nodrag]')) return
        const el = e.currentTarget
        const pid = e.pointerId
        const sx = e.clientX
        const sy = e.clientY
        const immediate = e.pointerType === 'mouse' || Boolean(e.target.closest('[data-handle]'))
        let lx = sx
        let ly = sy
        let started = false
        let timer = 0

        const begin = () => {
          started = true
          const r = el.getBoundingClientRect()
          const w = Math.min(r.width, 340)
          navigator.vibrate?.(12)
          set({ payload, x: lx, y: ly, ox: Math.min(sx - r.left, w - 24), oy: sy - r.top, w, ...locate(lx, ly) })
          raf.current = requestAnimationFrame(tick)
        }
        const cleanup = () => {
          clearTimeout(timer)
          window.removeEventListener('pointermove', onMove)
          window.removeEventListener('pointerup', onUp)
          window.removeEventListener('pointercancel', onCancel)
        }
        const onMove = (ev) => {
          if (ev.pointerId !== pid) return
          lx = ev.clientX
          ly = ev.clientY
          if (started) return move(lx, ly)
          const dist = Math.hypot(lx - sx, ly - sy)
          if (immediate) {
            if (dist > 4) begin()
          } else if (dist > 8) {
            cleanup() // 手指先移動 = 想捲動
          }
        }
        const onUp = (ev) => {
          if (ev.pointerId !== pid) return
          cleanup()
          if (started) finish(true)
        }
        const onCancel = (ev) => {
          if (ev.pointerId !== pid) return
          cleanup()
          if (started) finish(false)
        }
        if (!immediate) timer = setTimeout(begin, 260)
        window.addEventListener('pointermove', onMove)
        window.addEventListener('pointerup', onUp)
        window.addEventListener('pointercancel', onCancel)
      },
    }),
    [finish, move, tick],
  )

  const value = useMemo(() => ({ drag, bind }), [drag, bind])

  return (
    <DragContext.Provider value={value}>
      {children}
      {drag && (
        <div
          className="pointer-events-none fixed z-50"
          style={{ left: drag.x - drag.ox, top: drag.y - drag.oy, width: drag.w }}
        >
          <div style={{ transform: 'rotate(-2deg) scale(1.03)' }}>{renderGhost?.(drag.payload, drag.zone)}</div>
        </div>
      )}
    </DragContext.Provider>
  )
}

export function useDrag() {
  return useContext(DragContext)
}
