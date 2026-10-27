// 小型彈簧動畫引擎(參考 Apple「Designing Fluid Interfaces」):
// 用 damping(阻尼比)和 response(反應時間,秒)描述彈簧,而不是固定時長。
// 特性:永遠從目前畫面上的值出發、可隨時中斷改目標、會接住放手時的速度。

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export function createSpring({ value = 0, damping = 1, response = 0.35, onUpdate, onRest } = {}) {
  let x = value
  let v = 0
  let target = value
  let raf = 0
  let last = 0
  let params = { damping, response }
  let restCb = onRest

  function frame(ts) {
    const dtTotal = Math.min(0.064, last ? (ts - last) / 1000 : 1 / 60)
    last = ts
    const omega = (2 * Math.PI) / params.response
    // 固定小步長積分,掉幀時也穩定
    let remaining = dtTotal
    while (remaining > 0) {
      const dt = Math.min(remaining, 1 / 240)
      remaining -= dt
      const a = -omega * omega * (x - target) - 2 * params.damping * omega * v
      v += a * dt
      x += v * dt
    }
    if (Math.abs(x - target) < 0.3 && Math.abs(v) < 8) {
      x = target
      v = 0
      raf = 0
      last = 0
      onUpdate?.(x)
      const cb = restCb
      cb?.(x)
      return
    }
    onUpdate?.(x)
    raf = requestAnimationFrame(frame)
  }

  return {
    get value() { return x },
    get velocity() { return v },
    get animating() { return raf !== 0 },
    // 直接設定(拖曳時 1:1 跟手),會停止動畫
    set(next, velocity = 0) {
      this.stop()
      x = target = next
      v = velocity
      onUpdate?.(x)
    },
    // 從目前的值與速度出發,彈到新目標
    to(next, { velocity, damping: d, response: r, onRest: cb } = {}) {
      target = next
      if (velocity !== undefined) v = velocity
      params = { damping: d ?? damping, response: r ?? response }
      restCb = cb ?? onRest
      if (!raf) {
        last = 0
        raf = requestAnimationFrame(frame)
      }
    },
    stop() {
      if (raf) cancelAnimationFrame(raf)
      raf = 0
      last = 0
    },
  }
}

// Apple 範例程式的動量投射:依放手速度推算最後會停在哪裡
export function project(velocity, decelerationRate = 0.998) {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate)
}

// 超出邊界時漸進阻力
export function rubberband(overshoot, dimension, constant = 0.55) {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot))
}

// 記錄最近幾個指標位置,放手時算出速度(px/s)
export function createVelocityTracker() {
  let samples = []
  return {
    reset() { samples = [] },
    add(pos, t) {
      samples.push({ pos, t })
      while (samples.length > 1 && t - samples[0].t > 100) samples.shift()
    },
    velocity() {
      if (samples.length < 2) return 0
      const a = samples[0], b = samples[samples.length - 1]
      const dt = b.t - a.t
      return dt > 0 ? ((b.pos - a.pos) / dt) * 1000 : 0
    },
  }
}
