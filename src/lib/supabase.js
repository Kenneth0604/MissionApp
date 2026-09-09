import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
export const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

/** A / B 對應的 Supabase Auth 帳號 email(可用環境變數覆寫) */
export const USER_EMAILS = {
  A: import.meta.env.VITE_USER_A_EMAIL || 'a@missionapp.app',
  B: import.meta.env.VITE_USER_B_EMAIL || 'b@missionapp.app',
}

export const isConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)

export const supabase = isConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    })
  : null

/** 任務 / 獎勵圖片共用的 Storage bucket(公開讀取,只有 A、B 能上傳) */
export const IMAGE_BUCKET = 'images'
