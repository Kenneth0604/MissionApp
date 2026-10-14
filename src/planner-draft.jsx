// 本機試玩用的獨立入口(npm run dev 後開 /MissionApp/planner-draft.html)
// 只借用 App 的主題與外觀,不需要登入 / Supabase
import React from 'react'
import ReactDOM from 'react-dom/client'
import { THEMES, ThemeProvider, useTheme } from './lib/theme.jsx'
import { installViewportFix } from './lib/viewportFix.js'
import Planner from './pages/Planner.jsx'
import './index.css'

installViewportFix()

function DraftShell() {
  const { theme, setTheme } = useTheme()
  const idx = THEMES.findIndex((t) => t.id === theme)
  const next = THEMES[(idx + 1) % THEMES.length]

  return (
    <div className="mx-auto flex h-full max-w-md flex-col bg-bg sm:max-w-4xl">
      <header className="pt-safe relative z-20 shrink-0">
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, var(--t-hero-from), var(--t-hero-to))', opacity: 0.92 }} />
        <div className="relative flex items-center justify-between px-4 py-3">
          <h1 className="text-lg font-bold tracking-wide text-white">
            發任務用ㄉ東西 <span className="text-sm font-medium opacity-80">· 排程草稿</span>
          </h1>
          <button
            onClick={() => setTheme(next.id)}
            className="rounded-full bg-white/20 px-2.5 py-0.5 text-sm font-medium text-white"
            title="切換主題"
          >
            🎨 {THEMES[idx]?.name}
          </button>
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-hidden px-3 pt-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}>
        <Planner />
      </main>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <DraftShell />
    </ThemeProvider>
  </React.StrictMode>,
)
