import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createSpring, prefersReducedMotion } from './spring.js'

// 慶祝動畫:核准任務 / 完成每日任務時,從按鈕位置噴出彩帶,「+N」徽章彈出後往上飄走,手機輕震。
// 任何地方呼叫 celebrate({ from: button.getBoundingClientRect(), text: '+10' }) 即可,
// 實際畫面由掛在最外層的 <CelebrationLayer /> 負責。
const listeners = new Set()

export function celebrate(opts) {
  for (const fn of listeners) fn(opts)
  // 同步震動:短、停、稍長,像「叮—咚」
  navigator.vibrate?.([12, 50, 22])
}

const cssVar = (name, fallback) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback

export function CelebrationLayer() {
  const canvasRef = useRef(null)
  const particles = useRef([])
  const raf = useRef(0)
  const [badges, setBadges] = useState([])
  const seq = useRef(0)

  useEffect(() => {
    const onCelebrate = ({ from, text, sub }) => {
      const rect = from || { left: window.innerWidth / 2 - 40, top: window.innerHeight / 2, width: 80, height: 0 }
      const x = rect.left + rect.width / 2
      const y = rect.top + (rect.height || 0) / 2
      const id = ++seq.current
      if (text) setBadges((b) => [...b, { id, x, y, text, sub }])
      setTimeout(() => setBadges((b) => b.filter((x) => x.id !== id)), 1600)
      if (prefersReducedMotion()) return
      burst(x, y)
    }
    listeners.add(onCelebrate)
    return () => listeners.delete(onCelebrate)
  }, [])

  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  function burst(x, y) {
    const colors = [cssVar('--t-primary', '#e86aa8'), cssVar('--t-accent', '#a78bfa'), cssVar('--t-success', '#16a37a'), cssVar('--t-warning', '#d98a1a'), '#ffd84d']
    for (let i = 0; i < 90; i++) {
      // 扇形往上噴,中間的飛得最高
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9
      const speed = 380 + Math.random() * 520
      particles.current.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        w: 5 + Math.random() * 5,
        h: 3 + Math.random() * 4,
        color: colors[i % colors.length],
        rot: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 14,
        flip: Math.random() * Math.PI * 2,
        flipSpeed: 6 + Math.random() * 10,
        round: Math.random() < 0.25,
        life: 0,
        maxLife: 1.3 + Math.random() * 0.9,
      })
    }
    if (!raf.current) {
      let last = 0
      const frame = (ts) => {
        const dt = Math.min(0.05, last ? (ts - last) / 1000 : 1 / 60)
        last = ts
        const c = canvasRef.current
        if (!c) { raf.current = 0; return }
        const dpr = window.devicePixelRatio || 1
        if (c.width !== window.innerWidth * dpr || c.height !== window.innerHeight * dpr) {
          c.width = window.innerWidth * dpr
          c.height = window.innerHeight * dpr
        }
        const ctx = c.getContext('2d')
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
        for (const p of particles.current) {
          p.life += dt
          p.vy += 1100 * dt // 重力
          p.vx *= Math.pow(0.12, dt) // 空氣阻力
          p.vy *= Math.pow(0.35, dt)
          p.x += p.vx * dt
          p.y += p.vy * dt
          p.rot += p.spin * dt
          p.flip += p.flipSpeed * dt
          const fade = Math.min(1, (p.maxLife - p.life) / 0.4)
          ctx.save()
          ctx.globalAlpha = Math.max(0, fade)
          ctx.translate(p.x, p.y)
          ctx.rotate(p.rot)
          ctx.scale(1, Math.cos(p.flip)) // 翻面,看起來像紙片在空中翻轉
          ctx.fillStyle = p.color
          if (p.round) { ctx.beginPath(); ctx.arc(0, 0, p.h / 1.5, 0, Math.PI * 2); ctx.fill() }
          else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
          ctx.restore()
        }
        particles.current = particles.current.filter((p) => p.life < p.maxLife && p.y < window.innerHeight + 40)
        raf.current = particles.current.length ? requestAnimationFrame(frame) : 0
        if (!raf.current) ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
      }
      raf.current = requestAnimationFrame(frame)
    }
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-[60]" aria-hidden="true">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {badges.map((b) => <Badge key={b.id} {...b} />)}
    </div>
  )
}

// 「+N」徽章:彈簧放大(帶一點回彈,這是一個「慶祝」的瞬間)→ 停一下 → 往上飄並淡出
function Badge({ x, y, text, sub }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (prefersReducedMotion()) {
      el.animate([{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.75 }, { opacity: 0 }], { duration: 1500, fill: 'forwards' })
      return
    }
    let lift = 0
    const apply = (s) => { el.style.transform = `translate(-50%, calc(-50% - ${lift}px)) scale(${s})` }
    const scale = createSpring({ value: 0.3, damping: 0.55, response: 0.35, onUpdate: apply })
    scale.to(1)
    const start = performance.now()
    let raf = 0
    const float = (ts) => {
      const t = (ts - start) / 1000
      if (t > 0.65) {
        const k = Math.min(1, (t - 0.65) / 0.8)
        lift = 70 * (1 - Math.pow(1 - k, 3))
        el.style.opacity = String(1 - k)
        apply(scale.value)
      }
      if (t < 1.5) raf = requestAnimationFrame(float)
    }
    raf = requestAnimationFrame(float)
    return () => { scale.stop(); cancelAnimationFrame(raf) }
  }, [])
  return (
    <div
      ref={ref}
      className="absolute flex flex-col items-center whitespace-nowrap rounded-full px-4 py-2 text-white shadow-xl"
      style={{
        left: x,
        top: y - 64,
        transform: 'translate(-50%, -50%) scale(0.3)',
        background: 'linear-gradient(135deg, var(--t-hero-from), var(--t-hero-to))',
        boxShadow: '0 10px 30px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.35)',
      }}
    >
      <span className="text-2xl font-extrabold tabular-nums" style={{ letterSpacing: '-0.02em' }}>{text}</span>
      {sub && <span className="text-[11px] font-semibold text-white/85">{sub}</span>}
    </div>
  )
}

// 數字用彈簧滾到新值(積分變動時)
export function AnimatedNumber({ value, className }) {
  const ref = useRef(null)
  const spring = useRef(null)
  if (!spring.current) {
    spring.current = createSpring({
      value,
      damping: 1,
      response: 0.6,
      onUpdate: (v) => { if (ref.current) ref.current.textContent = String(Math.round(v)) },
    })
  }
  // 文字由彈簧直接寫進 DOM,React 不管這個 span 的內容
  useLayoutEffect(() => {
    if (ref.current && !ref.current.textContent) ref.current.textContent = String(Math.round(spring.current.value))
    if (prefersReducedMotion()) spring.current.set(value)
    else spring.current.to(value)
  }, [value])
  useEffect(() => () => spring.current.stop(), [])
  return <span ref={ref} className={className} />
}
