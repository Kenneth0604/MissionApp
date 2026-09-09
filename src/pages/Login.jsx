import { useState } from 'react'
import { USERS, useStore } from '../lib/store.jsx'

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
        <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-indigo-600 text-4xl shadow-lg">
          🎯
        </div>
        <h1 className="text-2xl font-bold text-slate-900">MissionApp</h1>
        <p className="mt-1 text-sm text-slate-500">雙人任務與獎勵管理</p>
      </div>

      {!who ? (
        <div className="space-y-3">
          <p className="text-center text-sm text-slate-600">請選擇你的身分</p>
          {USERS.map((u) => (
            <button
              key={u.id}
              onClick={() => setWho(u.id)}
              className="w-full rounded-2xl bg-white py-5 text-lg font-semibold text-slate-800 shadow-sm ring-1 ring-slate-200 transition active:bg-indigo-50"
            >
              我是 {u.name}
            </button>
          ))}
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-base font-semibold text-slate-800">我是 {who}</span>
            <button type="button" onClick={() => { setWho(null); setPassword(''); setError('') }} className="text-sm text-indigo-600">
              換一個身分
            </button>
          </div>
          <input
            type="password"
            inputMode="numeric"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="輸入密碼"
            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3.5 text-lg outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          />
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <button
            type="submit"
            disabled={busy || !password}
            className="w-full rounded-2xl bg-indigo-600 py-3.5 text-lg font-semibold text-white shadow disabled:opacity-40"
          >
            登入
          </button>
          <p className="text-center text-xs text-slate-400">Prototype 預設密碼:1234</p>
        </form>
      )}
    </div>
  )
}
