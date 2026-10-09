import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
export const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

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

/** 任務 / 獎勵圖片共用的 Storage bucket(公開讀取;只能上傳到自己的資料夾,只能刪同組成員的圖) */
export const IMAGE_BUCKET = 'images'
