import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { otherUser, useStore } from '../lib/store.jsx'
import { badgesFor, statsFor } from '../lib/achievements.js'
import { celebrate } from '../lib/celebrate.jsx'
import { createSpring, prefersReducedMotion } from '../lib/spring.js'

// 連續天數卡 + 徽章牆 + 解鎖時的全螢幕徽章動畫。
// 動畫遵循 Apple 的彈簧參數(damping / response),一律可中斷、減少動態效果時改為淡入。

export function useAchievements(code) {
  const { ledger } = useStore()
  return useMemo(() => {
    const stats = statsFor(ledger, code)
    return { stats, badges: badgesFor(stats) }
  }, [ledger, code])
}

// ---------- 連續天數 ----------
export function StreakCard() {
  const { user, nameOf } = useStore()
  const other = otherUser(user)
  const me = useAchievements(user).stats
  const them = useAchievements(other).stats
  return (
    <section className="card relative p-4">
      <div className="flex items-center gap-4">
        <Flame lit={me.current > 0} pulse={me.doneToday} />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-muted">連續達成</p>
          <p className="flex items-baseline gap-1 text-ink">
            <span className="text-4xl font-bold tabular-nums" style={{ letterSpacing: '-0.03em' }}>{me.current}</span>
            <span className="text-sm font-semibold">天</span>
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {me.doneToday ? '今天已達成,明天繼續 ✨' : me.current > 0 ? '今天完成一個任務就能延續' : '完成任務開始累積'}
            {me.best > me.current && ` · 最佳 ${me.best} 天`}
          </p>
        </div>
        <div className="shrink-0 rounded-2xl px-3 py-2 text-center" style={{ background: 'var(--t-surface-2)' }}>
          <p className="text-[11px] text-muted">{nameOf(other)}</p>
          <p className="text-lg font-bold tabular-nums text-ink">{them.current > 0 ? '🔥' : '·'} {them.current}</p>
        </div>
      </div>
      <WeekDots user={user} />
    </section>
  )
}

// 最近 7 天的小圓點,今天在最右邊
function WeekDots({ user }) {
  const { ledger } = useStore()
  const days = useMemo(() => {
    const out = []
    const base = new Date(Date.now() - 3 * 3600e3)
    for (let i = 6; i >= 0; i--) {
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() - i)
      out.push(d)
    }
    const hit = new Set(ledger.filter((l) => l.user_id === user && l.amount > 0 && l.related_task_id).map((l) => {
      const t = new Date(new Date(l.created_at).getTime() - 3 * 3600e3)
      return t.toDateString()
    }))
    return out.map((d) => ({ label: '日一二三四五六'[d.getDay()], on: hit.has(d.toDateString()) }))
  }, [ledger, user])
  return (
    <div className="mt-3 flex justify-between px-1">
      {days.map((d, i) => (
        <div key={i} className="flex flex-col items-center gap-1">
          <span
            className="streak-dot"
            data-on={d.on || undefined}
            data-today={i === 6 || undefined}
            style={{ animationDelay: `${i * 40}ms` }}
          />
          <span className={`text-[10px] ${i === 6 ? 'font-bold text-ink' : 'text-muted'}`}>{d.label}</span>
        </div>
      ))}
    </div>
  )
}

function Flame({ lit, pulse }) {
  return (
    <div className="flame" data-lit={lit || undefined} data-pulse={pulse || undefined} aria-hidden="true">
      <svg viewBox="0 0 48 56" width="48" height="56">
        <defs>
          <linearGradient id="flame-outer" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="#ff4d1c" />
            <stop offset="0.6" stopColor="#ff8a1f" />
            <stop offset="1" stopColor="#ffc93c" />
          </linearGradient>
          <linearGradient id="flame-inner" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="#ffd84d" />
            <stop offset="1" stopColor="#fff6c9" />
          </linearGradient>
        </defs>
        <path className="flame-outer" d="M24 2c3 9 14 15 14 30a14 14 0 0 1-28 0c0-7 3-11 6-14 0 5 2 8 5 9-2-9 1-18 3-25z" fill="url(#flame-outer)" />
        <path className="flame-inner" d="M24 26c2 5 7 8 7 15a7 7 0 0 1-14 0c0-4 2-6 4-8 0 3 1 4 2 5-1-5 0-9 1-12z" fill="url(#flame-inner)" />
      </svg>
    </div>
  )
}

// ---------- 徽章牆 ----------
export function BadgeWall() {
  const { user } = useStore()
  const { badges } = useAchievements(user)
  const [open, setOpen] = useState(null)
  const count = badges.filter((b) => b.unlocked).length
  return (
    <section>
      <h2 className="section-title">
        成就徽章 <span className="rounded-full bg-surface-2 px-2 text-xs text-muted">{count}/{badges.length}</span>
      </h2>
      <div className="card grid grid-cols-4 gap-y-4 p-4">
        {badges.map((b, i) => (
          <button key={b.id} type="button" className="badge-cell" style={{ animationDelay: `${i * 30}ms` }} onClick={() => setOpen(b)}>
            <Medal badge={b} size={56} />
            <span className={`mt-1.5 block truncate text-[11px] font-semibold ${b.unlocked ? 'text-ink' : 'text-muted'}`}>{b.name}</span>
          </button>
        ))}
      </div>
      {open && <BadgeSheet badge={open} onClose={() => setOpen(null)} />}
    </section>
  )
}

export function Medal({ badge, size = 56 }) {
  const pct = badge.need ? badge.have / badge.need : 0
  const r = size / 2 - 2
  const c = 2 * Math.PI * r
  return (
    <span className="medal" data-tier={badge.tier} data-locked={!badge.unlocked || undefined} style={{ width: size, height: size }}>
      {!badge.unlocked && (
        <svg className="medal-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--t-line)" strokeWidth="3" />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--t-primary)" strokeWidth="3" strokeLinecap="round"
            strokeDasharray={`${c * pct} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        </svg>
      )}
      <span className="medal-face" style={{ fontSize: size * 0.46 }}>{badge.icon}</span>
    </span>
  )
}

// 點徽章:從下方彈出的小卡,說明條件與進度
function BadgeSheet({ badge, onClose }) {
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 pb-safe" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" style={{ animation: 'ach-fade 200ms ease-out' }} />
      <div className="badge-detail card relative mb-4 w-full max-w-sm p-6 text-center shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto w-fit"><Medal badge={badge} size={96} /></div>
        <p className="mt-3 text-xl font-bold text-ink">{badge.name}</p>
        <p className="mt-1 text-sm text-muted">{badge.desc}</p>
        <p className="mt-3 text-sm font-semibold tabular-nums" style={{ color: badge.unlocked ? 'var(--t-success)' : 'var(--t-primary)' }}>
          {badge.unlocked ? '已解鎖 ✓' : `進度 ${badge.have} / ${badge.need}`}
        </p>
        <button type="button" className="btn-secondary mt-5 w-full" onClick={onClose}>好</button>
      </div>
    </div>,
    document.body,
  )
}

// ---------- 解鎖偵測 ----------
// 記住每個帳號看過哪些徽章;第一次啟用時默默記下現有的,之後新解鎖的才播動畫。
const seenKey = (u) => `mission.badges.seen.${u}`
function readSeen(u) {
  try { const v = localStorage.getItem(seenKey(u)); return v ? new Set(JSON.parse(v)) : null } catch { return null }
}
function writeSeen(u, set) {
  try { localStorage.setItem(seenKey(u), JSON.stringify([...set])) } catch { /* 無痕模式等 */ }
}

export function AchievementWatcher() {
  const { user, ready } = useStore()
  const { badges } = useAchievements(user)
  const [queue, setQueue] = useState([])

  useEffect(() => {
    if (!user || !ready) return
    const unlocked = badges.filter((b) => b.unlocked)
    const seen = readSeen(user)
    if (!seen) { writeSeen(user, new Set(unlocked.map((b) => b.id))); return }
    const fresh = unlocked.filter((b) => !seen.has(b.id))
    if (!fresh.length) return
    for (const b of fresh) seen.add(b.id)
    writeSeen(user, seen)
    setQueue((q) => [...q, ...fresh])
  }, [badges, user, ready])

  const current = queue[0]
  if (!current) return null
  return <UnlockOverlay key={current.id} badge={current} onDone={() => setQueue((q) => q.slice(1))} />
}

function UnlockOverlay({ badge, onDone }) {
  const medalRef = useRef(null)
  const scrimRef = useRef(null)
  const [leaving, setLeaving] = useState(false)
  const scale = useRef(null)

  useEffect(() => {
    const el = medalRef.current
    if (!el) return
    const reduced = prefersReducedMotion()
    scale.current = createSpring({
      value: reduced ? 1 : 0.2,
      onUpdate: (s) => { el.style.transform = `scale(${s}) rotate(${(1 - s) * -40}deg)` },
    })
    if (!reduced) scale.current.to(1, { damping: 0.55, response: 0.5 })
    else el.style.transform = 'none'
    // 彩帶從徽章中心噴出(稍等它長到一定大小)
    const t = setTimeout(() => {
      const r = el.getBoundingClientRect()
      celebrate({ from: r })
    }, reduced ? 0 : 180)
    const auto = setTimeout(() => dismiss(), 4200)
    return () => { clearTimeout(t); clearTimeout(auto); scale.current?.stop() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function dismiss() {
    if (leaving) return
    setLeaving(true)
    const s = scale.current
    if (scrimRef.current) { scrimRef.current.style.transition = 'opacity 260ms ease'; scrimRef.current.style.opacity = '0' }
    if (!s || prefersReducedMotion()) { setTimeout(onDone, 200); return }
    // 縮小時阻尼拉滿、不回彈
    s.to(0, { damping: 1, response: 0.3, onRest: onDone })
  }

  return createPortal(
    <div ref={scrimRef} className="unlock-scrim fixed inset-0 z-[55] flex flex-col items-center justify-center px-8 text-center" onClick={dismiss} role="dialog" aria-label={`解鎖徽章:${badge.name}`}>
      <p className="unlock-kicker text-[13px] font-bold uppercase tracking-[0.2em] text-white/80">解鎖新徽章</p>
      <div ref={medalRef} className="relative my-6" style={{ transform: 'scale(0.2)' }}>
        <span className="unlock-rays" data-tier={badge.tier} />
        <Medal badge={badge} size={140} />
      </div>
      <p className="unlock-title text-3xl font-bold text-white" style={{ letterSpacing: '-0.02em' }}>{badge.name}</p>
      <p className="unlock-sub mt-2 text-[15px] text-white/80">{badge.desc}</p>
      <p className="unlock-sub mt-8 text-xs text-white/60">點一下繼續</p>
    </div>,
    document.body,
  )
}
