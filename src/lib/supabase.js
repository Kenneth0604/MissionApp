import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
export const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

/**
 * 兩位使用者的靜態設定(登入前就需要,因此不能從資料庫讀)
 * - email:Supabase Auth 帳號
 * - name:顯示名稱(登入後會以 users 資料表中的 name 為優先)
 * 可用環境變數覆寫。
 */
export const USERS = {
  A: {
    code: 'A',
    email: import.meta.env.VITE_USER_A_EMAIL || 'Kenneth_Lin@missionapp.app',
    name: import.meta.env.VITE_USER_A_NAME || 'Kenneth',
  },
  B: {
    code: 'B',
    email: import.meta.env.VITE_USER_B_EMAIL || 'Juniper_Kuo@missionapp.app',
    name: import.meta.env.VITE_USER_B_NAME || 'Juniper',
  },
}

export const USER_EMAILS = { A: USERS.A.email, B: USERS.B.email }

export const isConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)

export const supabase = isConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        // 登入一次後長期保持:session 存在裝置 localStorage,access token 到期自動用 refresh token 續期
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: 'missionapp-auth',
      },
    })
  : null

/** 任務 / 獎勵圖片共用的 Storage bucket(公開讀取,只有兩位成員能上傳) */
export const IMAGE_BUCKET = 'images'
