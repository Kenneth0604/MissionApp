/**
 * iOS Safari / 主畫面 App 的視窗修正
 * 1. 高度:100% / 100vh / 100dvh 在 iOS 上不可靠(工具列、安全區、鍵盤)。
 *    這裡量 visualViewport.height(沒有就用 innerHeight)寫進 --app-h,#root 以它為高度。
 *    鍵盤彈出時 visualViewport 會縮小,內容區跟著縮小、變成可捲動,不會被鍵盤蓋住。
 * 2. 位移:鍵盤彈出時 iOS 會把可視區域往下平移(visualViewport.offsetTop),
 *    body 是 fixed 所以頁面本身捲不動,改用 --app-top 讓 #root 跟著可視區域走。
 * 3. 鍵盤狀態:可視高度比版面高度少很多就在 <html> 加上 kb-open,CSS 據此收起頂欄與底部導覽,
 *    把空間讓給表單。
 * 4. 輸入框聚焦後,把它捲到可視範圍中間。
 */
export function installViewportFix() {
  const root = document.documentElement
  const vv = window.visualViewport
  const KEYBOARD_MIN_PX = 120

  const apply = () => {
    const h = Math.round(vv?.height || window.innerHeight)
    if (h > 0) root.style.setProperty('--app-h', `${h}px`)
    const top = Math.max(0, Math.round(vv?.offsetTop || 0))
    root.style.setProperty('--app-top', `${top}px`)
    const keyboard = vv ? window.innerHeight - vv.height > KEYBOARD_MIN_PX : false
    root.classList.toggle('kb-open', keyboard)
    return keyboard
  }

  const reset = () => {
    // 鍵盤開著時不要硬把視窗拉回 0,否則會和 Safari 把輸入框捲進可視區的動作打架
    if (root.classList.contains('kb-open')) return
    if (window.scrollY || window.scrollX) window.scrollTo(0, 0)
    if (root.scrollTop) root.scrollTop = 0
    if (document.body.scrollTop) document.body.scrollTop = 0
  }

  const later = () => {
    apply(); reset()
    setTimeout(() => { apply(); reset() }, 60)
    setTimeout(() => { apply(); reset() }, 300)
  }

  const onFocusIn = (e) => {
    const el = e.target
    if (!(el instanceof HTMLElement) || !el.matches('input, textarea, select, [contenteditable="true"]')) return
    // 等鍵盤動畫與 --app-h 更新完,再把輸入框捲到中間(捲的是 <main> 這類內部捲動容器)
    setTimeout(() => {
      apply()
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }, 350)
  }

  apply()
  window.addEventListener('resize', later)
  window.addEventListener('orientationchange', later)
  window.addEventListener('pageshow', later)
  document.addEventListener('focusin', onFocusIn)
  document.addEventListener('focusout', later)
  vv?.addEventListener('resize', later)
  vv?.addEventListener('scroll', () => { apply(); reset() })
}
