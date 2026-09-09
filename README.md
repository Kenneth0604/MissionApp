# MissionApp

雙人任務 / 獎勵管理 PWA。A、B 兩人可互相派發任務、審核完成情況,並透過積分兌換實體獎勵。

> **目前狀態:Prototype(階段 1)**
> 已完成登入、Dashboard、任務列表、建立/編輯任務、標記完成、審核(核准/退回)、重複任務、積分明細等基本流程與 UI。
> 資料層暫時以瀏覽器 localStorage 模擬,尚未接 Supabase;獎勵兌換、Web Push、Service Worker、GitHub Actions 部署將在下一階段實作。

## 技術棧

- React 19 + Vite 8 + Tailwind CSS v4
- react-router-dom v7(HashRouter,適合 GitHub Pages 靜態站台)
- 之後:Supabase(Postgres + RLS + Realtime + Edge Functions)、Web Push、GitHub Pages

## 本機開發

```bash
npm install
npm run dev
```

開啟終端機顯示的網址(預設 http://localhost:5173/MissionApp/)。
Prototype 登入密碼:A、B 皆為 `1234`。

建議用瀏覽器的手機模擬模式檢視;同一瀏覽器共用同一份 localStorage 資料與登入身分,切換身分請直接登出再登入。

## 專案結構

```
src/
  lib/store.jsx        資料層(目前為 localStorage mock,之後換成 supabase-js)
  lib/format.js        日期 / 重複規則顯示工具
  components/          Layout(頂欄 + 底部導覽)、TaskCard、StatusBadge
  pages/               Login、Dashboard、Tasks、TaskForm、TaskDetail、Points、ComingSoon
public/
  manifest.json        PWA manifest
  icons/               預留位置 icon(之後可替換)
```

## 任務狀態流程

```
pending(待完成)→ submitted(待審核)→ approved(核准,發積分)
                                     └→ rejected(退回,附原因)→ submitted(重新提交)
```

重複任務在 **核准後** 才產生下一期(避免沒做卻不斷疊加),建立者可隨時「停用重複」。

## 後續階段

1. Supabase:SQL migration(建表、RLS、trigger)、密碼雜湊驗證、session token
2. 獎勵目錄與兌換流程(rewards / redemptions / points_ledger 扣點)
3. Service Worker、Web Push(VAPID)、Supabase Database Webhook → Edge Function 推播
4. GitHub Actions 自動部署到 GitHub Pages、環境變數注入
