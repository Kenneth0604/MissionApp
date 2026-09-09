import { NavLink, Outlet } from 'react-router-dom'
import { useStore } from '../lib/store.jsx'

const NAV = [
  { to: '/', label: '首頁', icon: HomeIcon, end: true },
  { to: '/tasks', label: '任務', icon: TaskIcon },
  { to: '/points', label: '積分', icon: CoinIcon },
  { to: '/rewards', label: '獎勵', icon: GiftIcon },
]

export default function Layout() {
  const { user, logout } = useStore()

  return (
    <div className="mx-auto flex h-full max-w-md flex-col bg-slate-100">
      <header className="pt-safe sticky top-0 z-10 bg-indigo-600 text-white shadow">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-lg font-bold tracking-wide">MissionApp</h1>
          <div className="flex items-center gap-3 text-sm">
            <span className="rounded-full bg-white/20 px-2.5 py-0.5 font-medium">我是 {user}</span>
            <button onClick={logout} className="text-white/80 underline-offset-2 hover:underline">
              登出
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 pb-24 pt-4">
        <Outlet />
      </main>

      <nav className="pb-safe fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white">
        <div className="mx-auto grid max-w-md grid-cols-4">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 py-2 text-xs ${
                  isActive ? 'text-indigo-600' : 'text-slate-500'
                }`
              }
            >
              <Icon className="h-6 w-6" />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}

function HomeIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 11l9-8 9 8v9a1 1 0 01-1 1h-5v-6h-6v6H4a1 1 0 01-1-1z" />
    </svg>
  )
}
function TaskIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5h6M9 3h6a1 1 0 011 1v1H8V4a1 1 0 011-1zM6 5h12a1 1 0 011 1v14a1 1 0 01-1 1H6a1 1 0 01-1-1V6a1 1 0 011-1zM9 12l2 2 4-4" />
    </svg>
  )
}
function CoinIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" d="M12 7v10M9.5 9.5h3.5a1.75 1.75 0 010 3.5H10a1.75 1.75 0 000 3.5h4.5" />
    </svg>
  )
}
function GiftIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 11h16v9a1 1 0 01-1 1H5a1 1 0 01-1-1v-9zM3 7h18v4H3zM12 7v14M12 7c-2-3-5-3-5-1s3 1 5 1zm0 0c2-3 5-3 5-1s-3 1-5 1z" />
    </svg>
  )
}
