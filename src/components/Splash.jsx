export default function Splash({ error, onLogout }) {
  return (
    <div className="pt-safe pb-safe mx-auto flex min-h-full max-w-md flex-col items-center justify-center px-6 text-center">
      <div className="hero mb-4 flex h-20 w-20 items-center justify-center rounded-3xl text-4xl shadow-lg">🎯</div>
      <h1 className="text-xl font-bold text-ink">MissionApp</h1>
      {error ? (
        <>
          <p className="mt-3 rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>
          {onLogout && (
            <button onClick={onLogout} className="btn-secondary mt-4">
              登出並重新登入
            </button>
          )}
        </>
      ) : (
        <p className="mt-2 animate-pulse text-sm text-muted">載入中…</p>
      )}
    </div>
  )
}
