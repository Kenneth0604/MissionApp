import { NavLink, Outlet } from 'react-router-dom'
import { isDaily, isReviewer, isTodoFor, otherUser, useStore } from '../lib/store.jsx'

export default function Layout() {
  const { user, nameOf, tasks, redemptions } = useStore()

  const todo = tasks.filter((t) => !isDaily(t) && isTodoFor(t, user)).length
  const review = tasks.filter((t) => !isDaily(t) && isReviewer(t, user)).length
  const dailyBadge = tasks.filter((t) => isDaily(t) && (isTodoFor(t, user) || isReviewer(t, user))).length
  const pendingRedemptions = redemptions.filter((d) => d.status === 'requested' && d.requested_by !== user).length

  const nav = [
    { to: '/', label: '首頁', icon: HomeIcon, end: true },
    { to: '/tasks', label: '任務', icon: TaskIcon, badge: todo + review },
    { to: '/daily', label: '每日', icon: CalendarIcon, badge: dailyBadge },
    { to: '/rewards', label: '獎勵', icon: GiftIcon },
    { to: '/redemptions', label: '兌換', icon: BagIcon, badge: pendingRedemptions },
    { to: '/settings', label: '設定', icon: GearIcon },
  ]

  return (
    <div className="mx-auto flex h-full max-w-md flex-col bg-bg">
      <header className="pt-safe hero sticky top-0 z-10 text-white shadow">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-lg font-bold tracking-wide">發任務用ㄉ東西</h1>
          <div className="flex items-center gap-1.5">
            <NavLink to="/partner" className={({ isActive }) => `rounded-full px-2.5 py-0.5 text-sm font-medium ${isActive ? 'bg-white text-primary' : 'bg-white/20'}`}>
              👤 {nameOf(otherUser(user))}
            </NavLink>
            <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-sm font-medium">{nameOf(user)}</span>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-x-hidden overflow-y-auto px-4 pb-6 pt-4">
        <Outlet />
      </main>

      {/* 一般 flex 子元素而非 fixed:iOS 主畫面 App 對 fixed+bottom:0 的高度計算會留縫 */}
      <nav className="pb-safe z-10 shrink-0 border-t border-line bg-surface">
        <div className="mx-auto grid max-w-md grid-cols-6">
          {nav.map(({ to, label, icon: Icon, end, badge }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `relative flex flex-col items-center gap-0.5 py-2 text-[11px] ${isActive ? 'text-primary' : 'text-muted'}`
              }
            >
              <Icon className="h-6 w-6" />
              {label}
              {badge > 0 && (
                <span className="absolute right-3 top-1 min-w-[18px] rounded-full bg-danger px-1 text-center text-[10px] font-bold leading-[18px] text-white">
                  {badge}
                </span>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}

const svgProps = { fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }

function HomeIcon({ className }) {
  return (
    <svg className={className} {...svgProps}>
      <path d="M3 11l9-8 9 8v9a1 1 0 01-1 1h-5v-6h-6v6H4a1 1 0 01-1-1z" />
    </svg>
  )
}
function TaskIcon({ className }) {
  return (
    <svg className={className} {...svgProps}>
      <path d="M9 5h6M9 3h6a1 1 0 011 1v1H8V4a1 1 0 011-1zM6 5h12a1 1 0 011 1v14a1 1 0 01-1 1H6a1 1 0 01-1-1V6a1 1 0 011-1zM9 12l2 2 4-4" />
    </svg>
  )
}
function CalendarIcon({ className }) {
  return (
    <svg className={className} {...svgProps}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
      <path d="M8 14h2M14 14h2M8 17h2" />
    </svg>
  )
}
function GiftIcon({ className }) {
  return (
    <svg className={className} {...svgProps}>
      <path d="M4 11h16v9a1 1 0 01-1 1H5a1 1 0 01-1-1v-9zM3 7h18v4H3zM12 7v14M12 7c-2-3-5-3-5-1s3 1 5 1zm0 0c2-3 5-3 5-1s-3 1-5 1z" />
    </svg>
  )
}
function BagIcon({ className }) {
  return (
    <svg className={className} {...svgProps}>
      <path d="M5 8h14l-1 12H6L5 8zM9 8V6a3 3 0 016 0v2" />
    </svg>
  )
}
function GearIcon({ className }) {
  return (
    <svg className={className} {...svgProps}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 01-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 01-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 012.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 012.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z" />
    </svg>
  )
}
