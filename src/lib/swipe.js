import { useRef, useState } from 'react'

/**
 * 右滑手勢(觸控 / 觸控筆;滑鼠拖曳留給排序用)
 *  - 水平往右滑超過 10px 才鎖定成滑動,垂直為主就放給捲動 / 長按拖曳
 *  - 放開時超過寬度的 threshold 比例就觸發 onCommit,否則彈回
 *  - [data-nodrag] / [data-handle] 上不觸發
 * 回傳 { dx, armed, settling, onPointerDown };元素要設 touch-action: pan-y
 */
export function useSwipeRight(onCommit, { threshold = 0.35, disabled = false } = {}) {
  const [dx, setDx] = useState(0)
  const [settling, setSettling] = useState(false)
  const commitRef = useRef(onCommit)
  commitRef.current = onCommit
  const disabledRef = useRef(disabled)
  disabledRef.current = disabled // 例如長按後已經進入拖曳排序,就不要再當成滑動
  const widthRef = useRef(1)

  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse' || e.button !== 0) return
    if (e.target.closest('[data-nodrag],[data-handle]')) return
    const pid = e.pointerId
    const sx = e.clientX
    const sy = e.clientY
    widthRef.current = e.currentTarget.getBoundingClientRect().width || 1
    let locked = false
    let last = 0
    let buzzed = false

    const cleanup = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
    }
    const onMove = (ev) => {
      if (ev.pointerId !== pid) return
      if (disabledRef.current) {
        if (locked) setDx(0)
        locked = false
        return cleanup()
      }
      const mx = ev.clientX - sx
      const my = ev.clientY - sy
      if (!locked) {
        if (Math.abs(my) > 10 && Math.abs(my) > Math.abs(mx)) return cleanup()
        if (mx > 10 && mx > Math.abs(my) * 1.2) {
          locked = true
          setSettling(false)
        } else return
      }
      last = Math.max(0, mx)
      const over = last > widthRef.current * threshold
      if (over && !buzzed) navigator.vibrate?.(10)
      buzzed = over
      setDx(last)
    }
    const finish = (commit) => {
      cleanup()
      if (!locked) return
      // 滑完吃掉緊接著的 click,避免順便打開編輯
      const stop = (ev) => {
        ev.stopPropagation()
        ev.preventDefault()
      }
      window.addEventListener('click', stop, { capture: true, once: true })
      setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 80)
      setSettling(true)
      if (commit && last > widthRef.current * threshold) {
        setDx(widthRef.current)
        setTimeout(() => {
          commitRef.current?.()
          setSettling(false)
          setDx(0)
        }, 160)
      } else {
        setDx(0)
      }
    }
    const onUp = (ev) => ev.pointerId === pid && finish(true)
    const onCancel = (ev) => ev.pointerId === pid && finish(false)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
  }

  return { dx, armed: dx > widthRef.current * threshold, settling, onPointerDown }
}
