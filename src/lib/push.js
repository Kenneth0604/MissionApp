import { supabase, VAPID_PUBLIC_KEY } from './supabase.js'

const SW_URL = `${import.meta.env.BASE_URL}sw.js`

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(SW_URL, { scope: import.meta.env.BASE_URL })
      .then((reg) => reg.update().catch(() => {}))
      .catch((err) => console.warn('Service Worker 註冊失敗', err))
  })
}

/** 目前裝置對推播的支援狀況,供設定頁顯示引導 */
export function pushEnvironment() {
  const ua = navigator.userAgent
  const isIOS = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
  const supported =
    'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && Boolean(VAPID_PUBLIC_KEY)
  const permission = 'Notification' in window ? Notification.permission : 'unsupported'
  return { isIOS, isStandalone, supported, permission, hasVapid: Boolean(VAPID_PUBLIC_KEY) }
}

export async function getCurrentSubscription() {
  if (!('serviceWorker' in navigator)) return null
  const reg = await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL)
  if (!reg) return null
  return reg.pushManager.getSubscription()
}

export async function enablePush(userId) {
  const env = pushEnvironment()
  if (!env.supported) throw new Error('此裝置或瀏覽器不支援推播通知')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('尚未允許通知權限')

  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })
  }
  const json = sub.toJSON()
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      { user_id: userId, endpoint: json.endpoint, subscription: json, user_agent: navigator.userAgent },
      { onConflict: 'endpoint' },
    )
  if (error) throw error
  return sub
}

export async function disablePush() {
  const sub = await getCurrentSubscription()
  if (!sub) return
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}
