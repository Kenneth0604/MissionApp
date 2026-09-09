export default function SetupNeeded() {
  return (
    <div className="pt-safe pb-safe mx-auto flex min-h-full max-w-md flex-col justify-center px-6">
      <div className="card p-6">
        <div className="text-3xl">🛠️</div>
        <h1 className="mt-2 text-lg font-bold text-ink">尚未設定 Supabase</h1>
        <p className="mt-2 text-sm text-muted">
          找不到 <code className="rounded bg-surface-2 px-1">VITE_SUPABASE_URL</code> 與{' '}
          <code className="rounded bg-surface-2 px-1">VITE_SUPABASE_ANON_KEY</code>。
        </p>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-ink">
          <li>本機開發:複製 <code className="rounded bg-surface-2 px-1">.env.example</code> 為 <code className="rounded bg-surface-2 px-1">.env.local</code> 並填入值,重新啟動 dev server。</li>
          <li>GitHub Pages:在 repo Settings → Secrets and variables → Actions 新增同名 secrets 後重新部署。</li>
        </ol>
        <p className="mt-3 text-xs text-muted">完整步驤請見 README。</p>
      </div>
    </div>
  )
}
