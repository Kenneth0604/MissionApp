import { useState } from 'react'
import { useStore } from '../lib/store.jsx'

const USERS = ['A', 'B']

export default function Login() {
  const { login } = useStore()
  const [who, setWho] = useState(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await login(who, password)
    } catch (err) {
      setError(err.message || '登入失敗')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="pt-safe pb-safe mx-auto flex min-h-full max-w-md flex-col justify-center px-6">
      <div className="mb-10 text-center">
        <div className="hero mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-3xl text-4xl shadow-lg">🎯</div>
        <h1 className="text-2xl font-bold text-ink">MissionApp</h1>
        <p className="mt-1 text-sm text-muted">雙人任務與獎勵管理</p>
      </div>

      {!who ? (
        <div className="space-y-3">
          <p className="text-center text-sm text-muted">請選擇你的身分</p>
          {USERS.map((u) => (
            <button key={u} onClick={() => setWho(u)} className="card w-full py-5 text-lg font-semibold text-ink transition active:bg-surface-2">
              我是 {u}
            </button>
          ))}
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-base font-semibold text-ink">我是 {who}</span>
            <button type="button" onClick={() => { setWho(null); setPassword(''); setError('') }} className="text-sm text-primary">
              換一個身分
            </button>
          </div>
          <input
            type="password"
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="輸入密碼"
            className="input py-3.5 text-lg"
          />
          {error && <p className="text-sm text-danger">{error}</p>}
          <button type="submit" disabled={busy || !password} className="btn-primary w-full py-3.5 text-lg">
            {busy ? '登入中…' : '登入'}
          </button>
        </form>
      )}
    </div>
  )
}
