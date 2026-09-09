/**
 * iOS 主畫面 App 的視窗修正
 * 焦點進入輸入框時,iOS 會把整個視窗往上捲以露出鍵盤;鍵盤收起後視窗常常停在偏移位置,
 * 而我們的 body 是 position:fixed 不能捲動,結果畫面底部就多出一塊空白。
 * 這裡在鍵盤收起 / 視窗尺寸變化時把捲動位置歸零。
 */
export function installViewportFix() {
  const reset = () => {
    if (window.scrollY || window.scrollX) window.scrollTo(0, 0)
    if (document.documentElement.scrollTop) document.documentElement.scrollTop = 0
    if (document.body.scrollTop) document.body.scrollTop = 0
  }
  const later = () => { reset(); setTimeout(reset, 60); setTimeout(reset, 300) }

  document.addEventListener('focusout', later)
  window.addEventListener('orientationchange', later)
  window.visualViewport?.addEventListener('resize', later)
  window.visualViewport?.addEventListener('scroll', reset)
}
