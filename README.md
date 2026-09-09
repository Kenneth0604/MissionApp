# 發任務用ㄉ東西(MissionApp)

雙人任務 / 獎勵管理 PWA。A、B 兩人可互相派發任務、審核完成情況,並透過積分兌換實體獎勵。
在 iPhone 上「加入主畫面」後即可當成獨立 App 使用,並可接收推播通知。

- 前端:React 19 + Vite 8 + Tailwind CSS v4(HashRouter)
- 後端:Supabase(Postgres + RLS + Realtime + Storage + Edge Functions)
- 部署:GitHub Actions → GitHub Pages
- 推播:Web Push(VAPID)+ Supabase Database Webhook → Edge Function

---

## 功能總覽

| 區塊 | 內容 |
| --- | --- |
| 登入 | 選「我是 沼王 / 我是 土王」+ 密碼。密碼由 Supabase Auth 以 bcrypt 雜湊儲存 |
| 任務 | 建立 / 編輯(標題、類別、說明、圖片、指派對象、獎勵、期限、重複)、標記完成、核准 / 退回(附原因) |
| 任務獎勵 | 可選「積分」或「指定獎勵目錄中的獎勵」;指定獎勵在核准後自動變成一筆待交付兌換,不扣點 |
| 重複任務 | 每天 / 每週幾;**核准後**才產生下一期;可停用 |
| 積分 | 餘額 = `points_ledger` 加總;可看雙方餘額與逐筆明細 |
| 獎勵目錄 | 名稱、類別、說明、圖片、所需積分、庫存(無限 / 限量)、啟用 / 停用 |
| 兌換 | 申請兌換(檢查可用積分)→ 對方確認交付(才扣點、扣庫存)或拒絕 |
| 類別 | 任務類別、獎勵類別各自獨立;表單內可直接新增;設定頁可管理;列表可篩選 |
| 主題 | 粉粉(粉紅 × 薰衣草)/ 黑黑(黑灰),存於裝置 |
| 通知 | 新任務、待審核、核准 / 退回、兌換申請、交付 / 拒絕 |
| PWA | manifest、Service Worker(離線殼、資源快取、推播) |

### 任務狀態

```
pending(待完成)→ submitted(待審核)→ approved(核准:發積分或建立待交付兌換)
                                     └→ rejected(退回,附原因)→ submitted(重新提交)
```

### 兌換狀態

```
requested(待確認)→ fulfilled(已交付:扣點、扣庫存)
                  └→ rejected(拒絕,不扣點)
```

---

## 一、設定 Supabase

### 1. 建立專案

1. 到 <https://supabase.com/dashboard> 建立新專案(Region 選 Northeast Asia / Tokyo 較快)。
2. 記下 **Project URL** 與 **anon public key**:Project Settings → API。

### 2. 建立 A、B 兩個登入帳號

1. Authentication → Users → **Add user** → **Create new user**。
2. 分別建立:
   - Email `Kenneth_Lin@missionapp.app`,密碼自訂 → **沼王**(A)的登入密碼
   - Email `Juniper_Kuo@missionapp.app`,密碼自訂 → **土王**(B)的登入密碼
3. 兩個都勾選 **Auto Confirm User**。
4. Authentication → Sign In / Providers → Email → 關閉 **Allow new users to sign up**(避免其他人註冊)。

> 想改 email 或顯示名稱:同步修改 `supabase/migrations/0001_init.sql` 最底部的兩行,
> 並在 GitHub repo 設定 Variables `VITE_USER_A_EMAIL` / `VITE_USER_A_NAME` / `VITE_USER_B_EMAIL` / `VITE_USER_B_NAME`(本機則放 `.env.local`)。
> 顯示名稱也可以之後直接在 Table Editor 改 `users.name`,App 會以資料庫為準。

### 3. 執行 SQL migration

1. SQL Editor → New query。
2. 依序貼上並執行 `supabase/migrations/` 內的 `0001_init.sql`、`0003_categories_description.sql`、`0004_shared_tasks.sql`、`0005_category_hierarchy.sql`、`0006_task_priority.sql`、`0007_expire_on_miss.sql`、`0008_series_template.sql`(0002 是推播 webhook,見第 6 步)。
3. 最後一行 `select` 應該列出 `A`、`B` 兩列。若是空的,代表 step 2 的 email 沒對上。

這份 SQL 會建立:資料表、RLS policy、所有 RPC 函式、`images` Storage bucket 與其 policy、Realtime publication、keep-alive 函式。

### 4. 產生 VAPID 金鑰(推播用)

在本機終端機執行(需要 Node.js):

```bash
npx web-push generate-vapid-keys
```

會印出 Public Key 與 Private Key,先留著:

- Public Key → 前端環境變數 `VITE_VAPID_PUBLIC_KEY`
- Private Key → Edge Function secret `VAPID_PRIVATE_KEY`

### 5. 部署 Edge Function(推播)

需要 Supabase CLI(用 `npx supabase` 即可,不必全域安裝):

```bash
cd C:\missionApp
npx supabase login
npx supabase link --project-ref <PROJECT_REF>

# 設定 secrets(WEBHOOK_SECRET 自訂一串亂數即可)
npx supabase secrets set VAPID_PUBLIC_KEY=<公鑰> VAPID_PRIVATE_KEY=<私鑰> VAPID_SUBJECT=mailto:you@example.com WEBHOOK_SECRET=<亂數>

# 部署(webhook 不帶使用者 JWT,所以要 --no-verify-jwt;安全性由 WEBHOOK_SECRET 保障)
npx supabase functions deploy push-notify --no-verify-jwt
```

`<PROJECT_REF>` 是 Dashboard 網址 `https://supabase.com/dashboard/project/<PROJECT_REF>` 中的那段。

### 6. 建立 Database Webhook

開啟 [`supabase/migrations/0002_push_webhooks.sql`](supabase/migrations/0002_push_webhooks.sql),把 `PROJECT_REF` 與 `WEBHOOK_SECRET` 換成上一步的值,貼到 SQL Editor 執行。
它用 `pg_net` 建立兩個 trigger(`tasks`、`redemptions` 的 Insert / Update),直接呼叫 Edge Function,不需要在 Dashboard 另外建 Webhook。

也可以用 CLI 執行(已 `supabase link` 的情況下):

```bash
npx supabase db query --linked -f supabase/migrations/0002_push_webhooks.sql
```

要確認推播有送出,可查 `select status_code, content from net._http_response order by id desc limit 5;`。

---

## 二、部署到 GitHub Pages

### 1. 設定 Secrets

Repo → Settings → Secrets and variables → Actions → **New repository secret**:

| Secret | 值 |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase Project URL |
| `VITE_SUPABASE_ANON_KEY` | anon public key |
| `VITE_VAPID_PUBLIC_KEY` | VAPID Public Key |

(若改了 email 或名稱,另在 **Variables** 分頁加 `VITE_USER_A_EMAIL`、`VITE_USER_A_NAME`、`VITE_USER_B_EMAIL`、`VITE_USER_B_NAME`。)

### 2. 啟用 Pages

Repo → Settings → Pages → Build and deployment → Source 選 **GitHub Actions**。

### 3. 觸發部署

推送到 `main` 即自動建置與部署([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml));
也可在 Actions 頁面手動 Run workflow。完成後網址為:

```
https://kenneth0604.github.io/MissionApp/
```

> 若 repo 改名,請同步修改 `vite.config.js` 的 `BASE`、`public/manifest.json` 與 `src/sw.js` 內的 `/MissionApp/`。

### 4. Keep-alive

Supabase 免費方案 7 天沒有 API 活動會暫停專案。[`.github/workflows/keep-alive.yml`](.github/workflows/keep-alive.yml) 每 3 天會呼叫一次 `rpc/keep_alive`。
它使用與部署相同的兩個 secrets,不需額外設定。

注意:GitHub 對 60 天沒有 commit 的 repo 會自動停用排程,屆時到 Actions 頁點 **Enable workflow**,或推一個 commit 即可。

---

## 三、iPhone 安裝與開啟通知

1. 用 **Safari** 開啟 `https://kenneth0604.github.io/MissionApp/`(其他瀏覽器無法加入主畫面接收推播)。
2. 點下方「分享」→ **加入主畫面** → 加入。
3. 從主畫面開啟 MissionApp,登入。
4. 設定 → 推播通知 → **開啟通知** → 允許。

限制:

- 需 **iOS 16.4 以上**,且必須從主畫面開啟的獨立 App 才能收到推播;一般 Safari 分頁不行。
- 若不小心按了「不允許」,要到 iOS 設定 → 通知 → MissionApp 重新開啟。
- 每台裝置各自訂閱,兩人各自在自己的手機開一次即可。

Android / 桌機 Chrome 也可安裝(網址列的安裝圖示),推播同樣可用。

---

## 四、本機開發

```bash
npm install
copy .env.example .env.local     # 填入 Supabase URL / anon key / VAPID public key
npm run dev
```

開啟 <http://localhost:5173/MissionApp/>。同一瀏覽器只會保留一個登入身分,測試互動時可開一個一般視窗、一個無痕視窗分別登入 A 與 B。

```bash
npm run build      # 產出 dist/
npm run preview    # 預覽建置結果
```

---

## 專案結構

```
.github/workflows/
  deploy.yml               push main → 建置 → GitHub Pages
  keep-alive.yml           每 3 天 ping Supabase
public/
  manifest.json            PWA manifest
  icons/                   icon(預留位置,可替換 180 / 192 / 512)
src/
  sw.js                    Service Worker(建置時輸出成 /MissionApp/sw.js)
  lib/supabase.js          supabase-js client、環境變數
  lib/store.jsx            資料層:auth、讀取、RPC、Realtime
  lib/theme.jsx            雙主題切換
  lib/push.js              Service Worker 註冊、Web Push 訂閱
  lib/images.js            圖片壓縮與 Storage 上傳
  lib/toast.jsx            提示訊息
  components/              Layout、TaskCard、ImageUploader、CategoryPicker …
  pages/                   Login、Dashboard、Tasks、TaskForm、TaskDetail、Points、
                           Rewards、RewardForm、Redemptions、Settings
supabase/
  migrations/0001_init.sql        建表、RLS、RPC、Storage、Realtime、keep-alive
  migrations/0002_push_webhooks.sql  推播 webhook trigger
  functions/push-notify/          Edge Function:發送 Web Push
```

---

## 安全性設計

- **身分**:Supabase Auth 兩個固定帳號;前端只保存 Supabase session(自動續期)。Sign up 已關閉,且所有 policy 都要求 `auth.uid()` 存在於 `users` 表,其他人即使註冊也讀不到任何資料。
- **RLS**:所有資料表啟用 RLS,並對 `anon` 角色 revoke 全部權限。
- **積分**:`points_ledger` 沒有任何寫入 policy,只能由 `approve_task` / `fulfill_redemption` 等 `security definer` RPC 寫入;餘額永遠由 ledger 加總。
- **狀態流轉**:`tasks.status` 只能透過 RPC 改變;建立者只能直接編輯 / 刪除 `pending` 狀態的任務。
- **圖片**:`images` bucket 公開讀取(網址為不可猜測的 UUID),僅 A、B 可上傳 / 刪除;前端上傳前先縮至 1280px JPEG。
- **推播**:Edge Function 以 `WEBHOOK_SECRET` 驗證來源;訂閱失效(404 / 410)會自動清除。

## 替換 icon

把自己的圖換掉 `public/icons/icon-180.png`(iOS)、`icon-192.png`、`icon-512.png` 即可,建議正方形、不透明背景。
