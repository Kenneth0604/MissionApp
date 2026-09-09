import { useEffect, useState } from 'react'
import { useStore } from '../lib/store.jsx'
import { THEMES, useTheme } from '../lib/theme.jsx'
import { useToast } from '../lib/toast.jsx'
import { disablePush, enablePush, getCurrentSubscription, pushEnvironment } from '../lib/push.js'
import CategoryManager from '../components/CategoryManager.jsx'

export default function Settings() {
  const { user, userId, logout } = useStore()
  const { theme, setTheme } = useTheme()
  const toast = useToast()
  const [env, setEnv] = useState(pushEnvironment)
  const [subscribed, setSubscribed] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    getCurrentSubscription().then((s) => setSubscribed(Boolean(s))).catch(() => {})
  }, [])

  async function togglePush() {
    setBusy(true)
    try {
      if (subscribed) {
        await disablePush()
        setSubscribed(false)
        toast.info('已關閉這台裝置的通知')
      } else {
        await enablePush(userId)
        setSubscribed(true)
        toast.success('通知已開啟')
      }
    } catch (err) {
      toast.error(err)
    } finally {
      setEnv(pushEnvironment())
      setBusy(false)
    }
  }

  const needsInstall = env.isIOS && !env.isStandalone

  return (
    <div className="space-y-6">
      <section>
        <h2 className="section-title">外觀主題</h2>
        <div className="grid grid-cols-2 gap-3">
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => setTheme(t.id)}
              className={`card p-4 text-left transition ${theme === t.id ? 'ring-2 ring-primary' : ''}`}
            >
              <div className="flex gap-1">
                {t.swatch.map((c) => <span key={c} className="h-6 w-6 rounded-full ring-1 ring-black/10" style={{ background: c }} />)}
              </div>
              <p className="mt-2 font-semibold text-ink">{t.name}</p>
              <p className="text-xs text-muted">{t.desc}</p>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="section-title">類別管理</h2>
        <CategoryManager />
      </section>

      <section>
        <h2 className="section-title">推播通知</h2>
        <div className="card space-y-3 p-4">
          {!env.hasVapid ? (
            <p className="text-sm text-muted">尚未設定 VAPID 公鑰(VITE_VAPID_PUBLIC_KEY),推播功能未啟用。</p>
          ) : needsInstall ? (
            <div className="text-sm text-ink">
              <p className="font-medium">iPhone / iPad 需先「加入主畫面」</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted">
                <li>在 Safari 點下方「分享」按鈕 <span aria-hidden>⎋</span></li>
                <li>選「加入主畫面」並確認</li>
                <li>從主畫面開啟 MissionApp,再回到這裡開啟通知</li>
              </ol>
              <p className="mt-2 text-xs text-muted">需 iOS 16.4 以上。一般 Safari 分頁無法接收推播。</p>
            </div>
          ) : !env.supported ? (
            <p className="text-sm text-muted">此瀏覽器不支援 Web Push。</p>
          ) : env.permission === 'denied' ? (
            <p className="text-sm text-danger">通知權限已被拒絕,請到系統設定 → 通知 → MissionApp 重新允許。</p>
          ) : (
            <>
              <p className="text-sm text-ink">
                {subscribed ? '這台裝置已開啟通知。' : '開啟後,有新任務、待審核、審核結果、兌換申請與交付時會收到通知。'}
              </p>
              <button onClick={togglePush} disabled={busy} className={subscribed ? 'btn-secondary w-full' : 'btn-primary w-full'}>
                {busy ? '處理中…' : subscribed ? '關閉這台裝置的通知' : '開啟通知'}
              </button>
            </>
          )}
        </div>
      </section>

      <section>
        <h2 className="section-title">帳號</h2>
        <div className="card flex items-center justify-between p-4">
          <div>
            <p className="font-semibold text-ink">我是 {user}</p>
            <p className="text-xs text-muted">登入狀態會保留在這台裝置</p>
          </div>
          <button onClick={logout} className="btn-secondary py-2 text-sm">登出</button>
        </div>
      </section>

      <p className="text-center text-xs text-muted">MissionApp · 僅供兩人私人使用</p>
    </div>
  )
}
