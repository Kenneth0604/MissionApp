import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../lib/store.jsx'
import { useToast } from '../lib/toast.jsx'

const WAIT_POLL_MS = 5000

/**
 * 組別入口(登入後、兩人到齊前)
 * - 還沒加入組別:建立新組(取得邀請碼)或輸入對方的邀請碼加入
 * - 已建立、等對方加入:顯示邀請碼 / 邀請連結,每 5 秒檢查對方是否加入(另有 Realtime)
 * - #/join/<邀請碼> 連結會自動帶入
 */
export default function PairGate() {
  const { pairStatus, pair, username, createPair, joinPair, refresh, logout } = useStore()
  const toast = useToast()
  const { code: codeParam } = useParams()
  const navigate = useNavigate()

  const [tab, setTab] = useState(codeParam ? 'join' : 'create')
  const [displayName, setDisplayName] = useState(username || '')
  const [code, setCode] = useState(codeParam?.toUpperCase() || '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (codeParam) {
      setCode(codeParam.toUpperCase())
      setTab('join')
    }
  }, [codeParam])

  // 等對方加入:定期重抓成員
  useEffect(() => {
    if (pairStatus !== 'waiting') return
    const timer = setInterval(() => refresh().catch(() => {}), WAIT_POLL_MS)
    return () => clearInterval(timer)
  }, [pairStatus, refresh])

  async function run(fn) {
    setBusy(true)
    setError('')
    try {
      await fn()
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message || '操作失敗')
    } finally {
      setBusy(false)
    }
  }

  const inviteCode = pair?.invite_code ?? ''
  const inviteLink = inviteCode ? `${location.origin}${location.pathname}#/join/${inviteCode}` : ''

  async function share() {
    const text = `一起用「發任務用ㄉ東西」!註冊後輸入邀請碼 ${inviteCode},或開啟連結:${inviteLink}`
    try {
      if (navigator.share) {
        await navigator.share({ title: '發任務用ㄉ東西 邀請', text })
        return
      }
      await navigator.clipboard.writeText(text)
      toast.success('已複製邀請訊息')
    } catch (err) {
      if (err?.name !== 'AbortError') toast.error('無法分享,請直接把邀請碼告訴對方')
    }
  }

  return (
    <div className="pt-safe pb-safe mx-auto flex min-h-full max-w-md flex-col justify-center px-6 py-8">
      <div className="mb-6 text-center">
        <div className="hero mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-3xl text-3xl shadow-lg">🎯</div>
        <h1 className="text-xl font-bold text-ink">{pairStatus === 'waiting' ? '等待對方加入' : '歡迎!先組成兩人一組'}</h1>
        <p className="mt-1 text-sm text-muted">每一組固定兩個人,互相派任務、審核、兌換獎勵,資料只有你們看得到。</p>
      </div>

      {pairStatus === 'waiting' ? (
        <div className="card space-y-4 p-5 text-center">
          <p className="text-sm text-muted">請對方註冊帳號後,在「輸入邀請碼」填入:</p>
          <p className="font-mono text-3xl font-bold tracking-[0.3em] text-ink">{inviteCode || '······'}</p>
          <button type="button" onClick={share} disabled={!inviteCode} className="btn-primary w-full">
            分享邀請
          </button>
          <p className="text-xs text-muted">對方加入後會自動進入 App。</p>
        </div>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-1 rounded-2xl bg-surface-2 p-1">
            {[
              ['create', '建立新組'],
              ['join', '輸入邀請碼'],
            ].map(([t, label]) => (
              <button
                key={t}
                type="button"
                onClick={() => { setTab(t); setError('') }}
                className={`rounded-xl py-2 text-sm font-semibold transition ${tab === t ? 'bg-surface text-ink shadow-sm' : 'text-muted'}`}
              >
                {label}
              </button>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              run(() => (tab === 'create' ? createPair(displayName) : joinPair(code, displayName)))
            }}
            className="card space-y-3 p-4"
          >
            {tab === 'join' && (
              <div>
                <label className="label">邀請碼</label>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s/g, ''))}
                  placeholder="6 碼,例如 AB3K9Z"
                  className="input text-center font-mono text-xl tracking-[0.3em] uppercase"
                  maxLength={6}
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                />
              </div>
            )}
            <div>
              <label className="label">我的顯示名稱</label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="對方看到的名字"
                maxLength={20}
                className="input"
                required
              />
            </div>
            {tab === 'create' && <p className="text-xs text-muted">建立後會拿到一組邀請碼,傳給另一個人讓他加入。</p>}
            {error && <p className="text-sm text-danger">{error}</p>}
            <button type="submit" disabled={busy || !displayName.trim() || (tab === 'join' && code.length < 6)} className="btn-primary w-full">
              {busy ? '請稍候…' : tab === 'create' ? '建立新組' : '加入'}
            </button>
          </form>
        </>
      )}

      <div className="mt-6 flex justify-center text-sm">
        <button onClick={logout} className="text-muted">
          登出({username})
        </button>
      </div>
    </div>
  )
}
