/* MissionApp Service Worker
 * - 快取 App Shell,離線時仍可開啟殼畫面
 * - 處理 Web Push 顯示通知與點擊導向
 * BUILD_ID 會在建置時由 vite.config.js 注入,每次部署換新快取
 */
const BUILD_ID = '__BUILD_ID__'
const BASE = '/MissionApp/'
const CACHE = `missionapp-${BUILD_ID}`
const SHELL = [BASE, `${BASE}index.html`, `${BASE}manifest.json`, `${BASE}icons/icon-192.png`, `${BASE}icons/icon-512.png`]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL).catch(() => {}))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('missionapp-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return // Supabase 等外部請求不快取

  // 只把成功的回應放進快取:部署中途的 404 / 5xx 頁若被存起來,離線殼就壞了
  const cachePut = (key, res) => {
    if (res && res.ok) {
      const copy = res.clone()
      caches.open(CACHE).then((c) => c.put(key, copy)).catch(() => {})
    }
    return res
  }

  // 導覽請求:先網路,失敗回快取殼
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => cachePut(`${BASE}index.html`, res))
        .catch(() => caches.match(`${BASE}index.html`).then((r) => r || caches.match(BASE))),
    )
    return
  }

  // 帶 hash 的建置資源(檔名含內容雜湊,不會變):快取優先
  if (url.pathname.startsWith(`${BASE}assets/`)) {
    event.respondWith(caches.match(request).then((hit) => hit || fetch(request).then((res) => cachePut(request, res))))
    return
  }

  // 其他同源檔案(manifest、icon,開發模式下還有原始模組):網路優先,失敗才回快取
  // 之前是 stale-while-revalidate,在 npm run dev 時會一直拿到舊的模組
  event.respondWith(
    fetch(request)
      .then((res) => cachePut(request, res))
      .catch(() => caches.match(request).then((hit) => hit || Response.error())),
  )
})

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: '發任務用ㄉ東西', body: event.data ? event.data.text() : '' }
  }
  const title = data.title || '發任務用ㄉ東西'
  const options = {
    body: data.body || '',
    icon: `${BASE}icons/icon-192.png`,
    badge: `${BASE}icons/icon-192.png`,
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
    data: { url: data.url || BASE },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(event.notification.data?.url || BASE, self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.startsWith(self.location.origin + BASE) && 'focus' in client) {
          client.navigate?.(target)
          return client.focus()
        }
      }
      return self.clients.openWindow(target)
    }),
  )
})
