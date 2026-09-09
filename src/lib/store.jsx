import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { supabase, isConfigured, USER_EMAILS, USERS } from './supabase.js'
import { deleteImages } from './images.js'

/**
 * 資料層(Supabase 版)
 * ----------------------------------------------------------------
 * - 身分:Supabase Auth 兩個固定帳號(A / B),登入畫面只選身分 + 密碼
 * - 讀取:直接 select 各資料表(受 RLS 保護,只有 A、B 能讀)
 * - 寫入:涉及狀態流轉、積分、庫存的操作一律走 Postgres RPC
 *        (submit_task / approve_task / request_redemption ...),
 *        前端無法直接寫 points_ledger
 * - 即時:Realtime postgres_changes → 重新抓取;另有 60 秒輪詢與
 *        回到前景時重抓作為備援
 */

export const STATUS_LABEL = {
  pending: '待完成',
  submitted: '待審核',
  approved: '已核准',
  rejected: '已退回',
}

export const REDEMPTION_LABEL = {
  requested: '待確認',
  fulfilled: '已交付',
  rejected: '已拒絕',
}

export const otherUser = (code) => (code === 'A' ? 'B' : 'A')

/** 這筆任務是否在 code 的待辦清單(被指派給我,或是共同任務) */
export const isTodoFor = (t, code) =>
  (t.shared || t.assigned_to === code) && (t.status === 'pending' || t.status === 'rejected')
/** code 是否為這筆任務目前的審核者(共同任務 = 非完成者;一般任務 = 建立者) */
export const isReviewer = (t, code) =>
  t.status === 'submitted' && (t.shared ? t.completed_by !== code : t.created_by === code)
/** 一般任務的審核者是建立者;共同任務則是「不是完成者的那個人」 */
export const reviewerOf = (t) => (t.shared ? (t.completed_by ? otherUser(t.completed_by) : null) : t.created_by)

const StoreContext = createContext(null)
const WATCHED_TABLES = ['tasks', 'points_ledger', 'rewards', 'redemptions', 'categories']
const POLL_MS = 60_000
const EMPTY = { tasks: [], ledger: [], rewards: [], redemptions: [], categories: [] }

function friendlyAuthError(err) {
  const m = err?.message || ''
  if (/invalid login credentials/i.test(m)) return '密碼錯誤'
  if (/email not confirmed/i.test(m)) return '帳號尚未啟用,請在 Supabase 後台確認 Auto Confirm'
  if (/rate limit/i.test(m)) return '嘗試太多次,請稍後再試'
  return m || '登入失敗'
}

function throwIf(error) {
  if (error) throw new Error(error.message || String(error))
}

export function StoreProvider({ children }) {
  const [authUser, setAuthUser] = useState(undefined) // undefined = 尚未得知
  const [users, setUsers] = useState([])
  const [raw, setRaw] = useState(EMPTY)
  const [ready, setReady] = useState(false)
  const [fatal, setFatal] = useState(null)
  const [attempt, setAttempt] = useState(0) // 載入失敗後「重試」用
  const refreshTimer = useRef(null)

  // ---------- Auth ----------
  useEffect(() => {
    if (!isConfigured) {
      setAuthUser(null)
      return
    }
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUser(session?.user ?? null)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const login = useCallback(async (code, password) => {
    if (!isConfigured) throw new Error('尚未設定 Supabase 環境變數')
    const { error } = await supabase.auth.signInWithPassword({ email: USER_EMAILS[code], password })
    if (error) throw new Error(friendlyAuthError(error))
  }, [])

  const logout = useCallback(async () => {
    setReady(false)
    setRaw(EMPTY)
    setFatal(null)
    await supabase?.auth.signOut()
  }, [])

  /** 載入失敗(例如離線)時重試,不登出、不清 session */
  const retry = useCallback(() => {
    setFatal(null)
    setAttempt((n) => n + 1)
  }, [])

  // ---------- 讀取 ----------
  const refresh = useCallback(async () => {
    if (!supabase || !authUser) return
    const [t, l, r, d, c] = await Promise.all([
      supabase.from('tasks').select('*').order('created_at', { ascending: false }),
      supabase.from('points_ledger').select('*').order('created_at', { ascending: false }),
      supabase.from('rewards').select('*').order('created_at', { ascending: true }),
      supabase.from('redemptions').select('*').order('created_at', { ascending: false }),
      supabase.from('categories').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
    ])
    throwIf(t.error || l.error || r.error || d.error || c.error)
    setRaw({ tasks: t.data, ledger: l.data, rewards: r.data, redemptions: d.data, categories: c.data })
  }, [authUser])

  const scheduleRefresh = useCallback(() => {
    clearTimeout(refreshTimer.current)
    refreshTimer.current = setTimeout(() => refresh().catch(() => {}), 300)
  }, [refresh])

  // 登入後:載入使用者對照表 + 全部資料,並訂閱 Realtime
  useEffect(() => {
    if (!authUser) return
    let cancelled = false

    ;(async () => {
      try {
        const { data: list, error } = await supabase.from('users').select('id, code, name').order('code')
        throwIf(error)
        if (cancelled) return
        if (!list.some((u) => u.id === authUser.id)) {
          setFatal('此帳號尚未加入 users 資料表(A / B),請依 README 完成設定。')
          return
        }
        setUsers(list)
        await refresh()
        if (!cancelled) setReady(true)
      } catch (e) {
        if (!cancelled) {
          const offline = typeof navigator !== 'undefined' && navigator.onLine === false
          setFatal(offline ? '目前離線,連上網路後請重試。' : `載入資料失敗:${e.message || '未知錯誤'}`)
        }
      }
    })()

    const channel = supabase.channel('missionapp-db')
    for (const table of WATCHED_TABLES) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, scheduleRefresh)
    }
    channel.subscribe()

    const onVisible = () => document.visibilityState === 'visible' && scheduleRefresh()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    const poll = setInterval(scheduleRefresh, POLL_MS)

    return () => {
      cancelled = true
      clearTimeout(refreshTimer.current)
      clearInterval(poll)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      supabase.removeChannel(channel)
    }
  }, [authUser, refresh, scheduleRefresh, attempt])

  // ---------- 對照與正規化 ----------
  const me = users.find((u) => u.id === authUser?.id) ?? null
  const user = me?.code ?? null
  const userId = me?.id ?? null
  const codeOf = useCallback((id) => users.find((u) => u.id === id)?.code ?? '?', [users])
  const idOf = useCallback((code) => users.find((u) => u.code === code)?.id ?? null, [users])
  /** 顯示名稱:優先用 users 資料表的 name,否則用靜態設定 */
  const nameOf = useCallback(
    (code) => users.find((u) => u.code === code)?.name || USERS[code]?.name || code || '?',
    [users],
  )

  // 類別:兩層(主類別 parent_id 為 null;次類別指向主類別),附上 parent 物件方便顯示
  const categories = useMemo(() => {
    const byId = Object.fromEntries(raw.categories.map((c) => [c.id, { ...c }]))
    Object.values(byId).forEach((c) => { c.parent = c.parent_id ? byId[c.parent_id] ?? null : null })
    return Object.values(byId).sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
  }, [raw.categories])
  const categoriesById = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c])), [categories])

  const rewards = useMemo(
    () =>
      raw.rewards.map((r) => ({
        ...r,
        created_by_id: r.created_by,
        created_by: codeOf(r.created_by),
        image_urls: r.image_urls ?? [],
        category: r.category_id ? categoriesById[r.category_id] ?? null : null,
      })),
    [raw.rewards, codeOf, categoriesById],
  )
  const rewardsById = useMemo(() => Object.fromEntries(rewards.map((r) => [r.id, r])), [rewards])

  const tasks = useMemo(
    () =>
      raw.tasks.map((t) => ({
        ...t,
        created_by_id: t.created_by,
        assigned_to_id: t.assigned_to,
        created_by: codeOf(t.created_by),
        assigned_to: t.assigned_to ? codeOf(t.assigned_to) : null,
        shared: Boolean(t.shared),
        priority: t.priority ?? 3,
        completed_by: t.completed_by ? codeOf(t.completed_by) : null,
        image_urls: t.image_urls ?? [],
        reward: t.reward_id ? rewardsById[t.reward_id] ?? null : null,
        category: t.category_id ? categoriesById[t.category_id] ?? null : null,
      })),
    [raw.tasks, codeOf, rewardsById, categoriesById],
  )
  const tasksById = useMemo(() => Object.fromEntries(tasks.map((t) => [t.id, t])), [tasks])

  const ledger = useMemo(
    () => raw.ledger.map((l) => ({ ...l, user_id_raw: l.user_id, user_id: codeOf(l.user_id) })),
    [raw.ledger, codeOf],
  )

  const redemptions = useMemo(
    () =>
      raw.redemptions.map((d) => ({
        ...d,
        requested_by_id: d.requested_by,
        requested_by: codeOf(d.requested_by),
        handled_by: d.handled_by ? codeOf(d.handled_by) : null,
        reward: rewardsById[d.reward_id] ?? null,
        task: d.related_task_id ? tasksById[d.related_task_id] ?? null : null,
      })),
    [raw.redemptions, codeOf, rewardsById, tasksById],
  )

  const balanceOf = useCallback(
    (code) => ledger.filter((l) => l.user_id === code).reduce((s, l) => s + l.amount, 0),
    [ledger],
  )
  /** 尚未交付但已申請的兌換所佔用的積分 */
  const reservedOf = useCallback(
    (code) =>
      redemptions
        .filter((d) => d.requested_by === code && d.status === 'requested')
        .reduce((s, d) => s + (d.cost_points || 0), 0),
    [redemptions],
  )

  // ---------- 寫入:共用 ----------
  const rpc = useCallback(
    async (fn, args) => {
      const { data, error } = await supabase.rpc(fn, args)
      throwIf(error)
      await refresh()
      return data
    },
    [refresh],
  )

  // ---------- 寫入:任務 ----------
  const toTaskRow = useCallback(
    (input) => ({
      title: input.title.trim(),
      description: input.description?.trim() ?? '',
      image_urls: input.image_urls ?? [],
      category_id: input.category_id || null,
      priority: Math.min(5, Math.max(1, Number(input.priority) || 3)),
      assigned_to: input.assigned_to === 'both' ? null : idOf(input.assigned_to),
      shared: input.assigned_to === 'both',
      reward_type: input.reward_type ?? 'points',
      reward_points: input.reward_type === 'points' ? Number(input.reward_points) || 0 : 0,
      reward_id: input.reward_type === 'reward' ? input.reward_id || null : null,
      due_date: input.due_date || null,
      recurrence_rule: input.recurrence_rule ?? null,
    }),
    [idOf],
  )

  const createTask = useCallback(
    async (input) => {
      const row = { ...toTaskRow(input), created_by: userId, status: 'pending' }
      const { data, error } = await supabase.from('tasks').insert(row).select().single()
      throwIf(error)
      await refresh()
      return data
    },
    [toTaskRow, userId, refresh],
  )

  const updateTask = useCallback(
    async (id, input) => {
      const { error } = await supabase.from('tasks').update(toTaskRow(input)).eq('id', id)
      throwIf(error)
      await refresh()
    },
    [toTaskRow, refresh],
  )

  const deleteTask = useCallback(
    async (id) => {
      const task = tasksById[id]
      const { error } = await supabase.from('tasks').delete().eq('id', id)
      throwIf(error)
      if (task?.image_urls?.length) deleteImages(task.image_urls).catch(() => {})
      await refresh()
    },
    [tasksById, refresh],
  )

  const submitTask = useCallback((id) => rpc('submit_task', { p_task_id: id }), [rpc])
  const approveTask = useCallback((id) => rpc('approve_task', { p_task_id: id }), [rpc])
  const rejectTask = useCallback((id, reason) => rpc('reject_task', { p_task_id: id, p_reason: reason ?? '' }), [rpc])
  const stopRecurrence = useCallback((id) => rpc('stop_recurrence', { p_task_id: id }), [rpc])

  // ---------- 寫入:獎勵與兌換 ----------
  const toRewardRow = (input) => ({
    name: input.name.trim(),
    description: input.description?.trim() ?? '',
    image_urls: input.image_urls ?? [],
    category_id: input.category_id || null,
    cost_points: Number(input.cost_points) || 0,
    stock: input.unlimited ? -1 : Math.max(0, Number(input.stock) || 0),
    is_active: input.is_active ?? true,
  })

  const createReward = useCallback(
    async (input) => {
      const { data, error } = await supabase.from('rewards').insert({ ...toRewardRow(input), created_by: userId }).select().single()
      throwIf(error)
      await refresh()
      return data
    },
    [userId, refresh],
  )

  const updateReward = useCallback(
    async (id, input) => {
      const { error } = await supabase.from('rewards').update(toRewardRow(input)).eq('id', id)
      throwIf(error)
      await refresh()
    },
    [refresh],
  )

  const requestRedemption = useCallback((rewardId) => rpc('request_redemption', { p_reward_id: rewardId }), [rpc])
  const fulfillRedemption = useCallback((id) => rpc('fulfill_redemption', { p_redemption_id: id }), [rpc])
  const rejectRedemption = useCallback(
    (id, reason) => rpc('reject_redemption', { p_redemption_id: id, p_reason: reason ?? '' }),
    [rpc],
  )

  // ---------- 寫入:類別 ----------
  /** 新增類別;parent_id 有值即為次類別 */
  const createCategory = useCallback(
    async ({ kind, name, parent_id = null }) => {
      const sort_order = categories.filter((c) => c.kind === kind && (c.parent_id ?? null) === parent_id).length
      const { data, error } = await supabase
        .from('categories')
        .insert({ kind, name: name.trim(), parent_id, sort_order, created_by: userId })
        .select()
        .single()
      throwIf(error)
      await refresh()
      return data
    },
    [categories, userId, refresh],
  )

  const updateCategory = useCallback(
    async (id, { name }) => {
      const { error } = await supabase.from('categories').update({ name: name.trim() }).eq('id', id)
      throwIf(error)
      await refresh()
    },
    [refresh],
  )

  const deleteCategory = useCallback(
    async (id) => {
      const { error } = await supabase.from('categories').delete().eq('id', id)
      throwIf(error)
      await refresh()
    },
    [refresh],
  )

  const value = useMemo(
    () => ({
      configured: isConfigured,
      authLoading: authUser === undefined,
      authUser,
      user,
      userId,
      users,
      nameOf,
      ready,
      fatal,
      login,
      logout,
      retry,
      refresh,
      tasks,
      ledger,
      rewards,
      redemptions,
      categories,
      categoriesById,
      balanceOf,
      reservedOf,
      createTask,
      updateTask,
      deleteTask,
      submitTask,
      approveTask,
      rejectTask,
      stopRecurrence,
      createReward,
      updateReward,
      requestRedemption,
      fulfillRedemption,
      rejectRedemption,
      createCategory,
      updateCategory,
      deleteCategory,
    }),
    [
      authUser, user, userId, users, nameOf, ready, fatal, login, logout, retry, refresh,
      tasks, ledger, rewards, redemptions, categories, categoriesById, balanceOf, reservedOf,
      createTask, updateTask, deleteTask, submitTask, approveTask, rejectTask, stopRecurrence,
      createReward, updateReward, requestRedemption, fulfillRedemption, rejectRedemption,
      createCategory, updateCategory, deleteCategory,
    ],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore 必須在 StoreProvider 內使用')
  return ctx
}
