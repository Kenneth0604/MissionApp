import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { supabase, isConfigured, USER_EMAILS, USERS } from './supabase.js'
import { deleteImages } from './images.js'
import { applyLocal, newId } from './localApply.js'
import { useToast } from './toast.jsx'

/**
 * 資料層(Supabase 版,離線優先)
 * ----------------------------------------------------------------
 * - 身分:Supabase Auth 兩個固定帳號(A / B),登入畫面只選身分 + 密碼
 * - 讀取:直接 select 各資料表(受 RLS 保護,只有 A、B 能讀);最近一次結果快取在 localStorage,
 *        開 App 先顯示快取,再背景更新
 * - 寫入:所有操作先套用到本機(樂觀更新)並放進 outbox,再背景依序同步到 Supabase;
 *        離線或失敗時保留在 outbox,連線恢復後自動重送;伺服器拒絕的操作會被丟棄並提示,
 *        然後重新抓取資料校正
 * - 狀態流轉、積分、庫存仍一律由 Postgres RPC 執行,前端無法直接寫 points_ledger
 * - 即時:Realtime postgres_changes → 重新抓取;另有 60 秒輪詢與回到前景時重抓作為備援
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
/** code 是否為這筆任務目前的審核者:一律是「完成者以外的那個人」 */
export const isReviewer = (t, code) => t.status === 'submitted' && t.completed_by !== code
/** 審核者(完成前無意義):完成者以外的那個人 */
export const reviewerOf = (t) => (t.completed_by ? otherUser(t.completed_by) : null)
/** 是否為「每日任務」區的週期性任務(有重複規則) */
export const isDaily = (t) => Boolean(t.recurrence_rule)
/** 我是否可以「幫對方完成」這個任務(不是原本的被指派者,任務未完成、非共同任務) */
export const canHelp = (t, code) => !t.shared && t.assigned_to && t.assigned_to !== code && (t.status === 'pending' || t.status === 'rejected')
/** 這筆任務是否是被「幫忙」完成的(完成者不是原本的被指派者)→ 積分獎勵會加倍 */
export const isHelped = (t) => !t.shared && Boolean(t.assigned_to) && Boolean(t.completed_by) && t.completed_by !== t.assigned_to

const StoreContext = createContext(null)
const WATCHED_TABLES = ['tasks', 'points_ledger', 'rewards', 'redemptions', 'categories', 'task_presets']
const POLL_MS = 60_000
const EMPTY = { tasks: [], ledger: [], rewards: [], redemptions: [], categories: [], presets: [] }
const OUTBOX_KEY = 'missionapp:outbox'
const USERS_KEY = 'missionapp:users'
const cacheKey = (uid) => `missionapp:cache:${uid}`

const readJSON = (key, fallback) => {
  try {
    const v = localStorage.getItem(key)
    return v ? JSON.parse(v) : fallback
  } catch {
    return fallback
  }
}
const writeJSON = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* ignore */
  }
}

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

/** 是「連不上」而不是「伺服器拒絕」:保留在 outbox 稍後重送 */
function isNetworkError(err) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  const m = String(err?.message || err || '')
  return err?.name === 'TypeError' || /failed to fetch|networkerror|load failed|network request failed|timeout|ECONN|fetch/i.test(m)
}

/** 把一個 outbox 操作真的送到 Supabase */
async function execOp(op) {
  if (op.type === 'rpc') {
    const { error } = await supabase.rpc(op.fn, op.args ?? {})
    throwIf(error)
  } else if (op.type === 'insert') {
    const { error } = await supabase.from(op.table).insert(op.row)
    // 重送時可能已經寫入成功(例如上次回應丟失):主鍵重複視為成功
    if (error && !/duplicate key|23505/i.test(error.message || '')) throwIf(error)
  } else if (op.type === 'update') {
    const { error } = await supabase.from(op.table).update(op.row).eq('id', op.id)
    throwIf(error)
  } else if (op.type === 'delete') {
    const { error } = await supabase.from(op.table).delete().eq('id', op.id)
    throwIf(error)
  }
}

export function StoreProvider({ children }) {
  const toast = useToast()
  const [authUser, setAuthUser] = useState(undefined) // undefined = 尚未得知
  const [users, setUsers] = useState(() => readJSON(USERS_KEY, []))
  const [raw, setRawState] = useState(EMPTY)
  const [ready, setReady] = useState(false)
  const [fatal, setFatal] = useState(null)
  const [attempt, setAttempt] = useState(0) // 載入失敗後「重試」用
  const [outbox, setOutboxState] = useState(() => readJSON(OUTBOX_KEY, []))
  const [offline, setOffline] = useState(typeof navigator !== 'undefined' && navigator.onLine === false)
  const [syncing, setSyncing] = useState(false)
  const refreshTimer = useRef(null)
  const rawRef = useRef(raw)
  const outboxRef = useRef(outbox)
  const flushing = useRef(false)
  const authRef = useRef(null)

  const setRaw = useCallback((next) => {
    setRawState((prev) => {
      const value = typeof next === 'function' ? next(prev) : next
      rawRef.current = value
      if (authRef.current) writeJSON(cacheKey(authRef.current.id), value)
      return value
    })
  }, [])
  const setOutbox = useCallback((next) => {
    const value = typeof next === 'function' ? next(outboxRef.current) : next
    outboxRef.current = value
    writeJSON(OUTBOX_KEY, value)
    setOutboxState(value)
  }, [])

  // ---------- Auth ----------
  useEffect(() => {
    if (!isConfigured) {
      setAuthUser(null)
      return
    }
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      authRef.current = session?.user ?? null
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
  }, [setRaw])

  /** 載入失敗(例如離線)時重試,不登出、不清 session */
  const retry = useCallback(() => {
    setFatal(null)
    setAttempt((n) => n + 1)
  }, [])

  // ---------- 讀取 ----------
  const fetchAll = useCallback(async () => {
    // 週期任務「過期即丟」的結算:資料庫每天凌晨 3 點由 pg_cron 執行,這裡是開 App 時的備援(冪等)
    await supabase.rpc('rollover_recurring_tasks').then(() => {}, () => {})
    const [t, l, r, d, c, p] = await Promise.all([
      supabase.from('tasks').select('*').order('created_at', { ascending: false }),
      supabase.from('points_ledger').select('*').order('created_at', { ascending: false }),
      supabase.from('rewards').select('*').order('created_at', { ascending: true }),
      supabase.from('redemptions').select('*').order('created_at', { ascending: false }),
      supabase.from('categories').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
      supabase.from('task_presets').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
    ])
    throwIf(t.error || l.error || r.error || d.error || c.error || p.error)
    return { tasks: t.data, ledger: l.data, rewards: r.data, redemptions: d.data, categories: c.data, presets: p.data }
  }, [])

  /** 重新抓取;若還有未同步的操作,先不覆蓋本機狀態(等 flush 完成後再抓) */
  const refresh = useCallback(async () => {
    if (!supabase || !authRef.current) return
    if (outboxRef.current.length > 0) return
    const data = await fetchAll()
    if (outboxRef.current.length > 0) return // 抓取期間又有新操作:以本機為準
    setRaw(data)
    setOffline(false)
  }, [fetchAll, setRaw])

  // ---------- 同步 outbox ----------
  const flush = useCallback(async () => {
    if (flushing.current || !supabase || !authRef.current) return
    if (outboxRef.current.length === 0) return
    flushing.current = true
    setSyncing(true)
    let needRefresh = false
    try {
      while (outboxRef.current.length > 0) {
        const op = outboxRef.current[0]
        try {
          await execOp(op)
          setOutbox((q) => q.filter((x) => x.id !== op.id))
          setOffline(false)
          needRefresh = true
        } catch (err) {
          if (isNetworkError(err)) {
            setOffline(true)
            break // 連不上:保留,稍後重送
          }
          // 伺服器拒絕(例如積分不足、狀態不對):丟棄這筆並提示,之後重抓校正
          setOutbox((q) => q.filter((x) => x.id !== op.id))
          toast.error(`同步失敗,已還原:${err.message || err}`)
          needRefresh = true
        }
      }
    } finally {
      flushing.current = false
      setSyncing(false)
    }
    if (needRefresh) await refresh().catch(() => {})
  }, [setOutbox, refresh, toast])

  const scheduleRefresh = useCallback(() => {
    clearTimeout(refreshTimer.current)
    refreshTimer.current = setTimeout(() => {
      if (outboxRef.current.length > 0) flush().catch(() => {})
      else refresh().catch(() => {})
    }, 300)
  }, [refresh, flush])

  /** 先套用到本機、寫進 outbox,再背景同步 */
  const mutate = useCallback(
    (op) => {
      const full = { id: newId(), ...op }
      setRaw((prev) => applyLocal(prev, full, { userId: authRef.current?.id }))
      setOutbox((q) => [...q, full])
      setTimeout(() => flush().catch(() => {}), 0)
    },
    [setRaw, setOutbox, flush],
  )

  // 登入後:先用快取顯示,再載入使用者對照表 + 全部資料,並訂閱 Realtime
  useEffect(() => {
    if (!authUser) return
    authRef.current = authUser
    let cancelled = false

    const cached = readJSON(cacheKey(authUser.id), null)
    const cachedUsers = readJSON(USERS_KEY, [])
    if (cached && cachedUsers.some((u) => u.id === authUser.id)) {
      rawRef.current = cached
      setRawState(cached)
      setUsers(cachedUsers)
      setReady(true)
    }

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
        writeJSON(USERS_KEY, list)
        if (outboxRef.current.length > 0) await flush()
        else await refresh()
        if (!cancelled) setReady(true)
      } catch (e) {
        if (cancelled) return
        const isOffline = isNetworkError(e)
        setOffline(isOffline)
        // 有快取就照常使用(離線模式),沒有才顯示錯誤
        if (!cached) setFatal(isOffline ? '目前離線,連上網路後請重試。' : `載入資料失敗:${e.message || '未知錯誤'}`)
      }
    })()

    const channel = supabase.channel('missionapp-db')
    for (const table of WATCHED_TABLES) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, scheduleRefresh)
    }
    channel.subscribe()

    const onVisible = () => document.visibilityState === 'visible' && scheduleRefresh()
    const onOnline = () => { setOffline(false); scheduleRefresh() }
    const onOffline = () => setOffline(true)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    const poll = setInterval(scheduleRefresh, POLL_MS)

    return () => {
      cancelled = true
      clearTimeout(refreshTimer.current)
      clearInterval(poll)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      supabase.removeChannel(channel)
    }
  }, [authUser, refresh, flush, scheduleRefresh, attempt])

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
    return Object.values(byId).sort((a, b) => a.sort_order - b.sort_order || String(a.created_at).localeCompare(String(b.created_at)))
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
      raw.tasks.filter((t) => t.status !== 'expired').map((t) => ({
        ...t,
        created_by_id: t.created_by,
        assigned_to_id: t.assigned_to,
        created_by: codeOf(t.created_by),
        assigned_to: t.assigned_to ? codeOf(t.assigned_to) : null,
        shared: Boolean(t.shared),
        priority: t.priority ?? 3,
        completed_by: t.completed_by ? codeOf(t.completed_by) : null,
        image_urls: t.image_urls ?? [],
        choices: t.choices ?? [],
        reward: t.reward_id ? rewardsById[t.reward_id] ?? null : null,
        category: t.category_id ? categoriesById[t.category_id] ?? null : null,
      })),
    [raw.tasks, codeOf, rewardsById, categoriesById],
  )
  const tasksById = useMemo(() => Object.fromEntries(tasks.map((t) => [t.id, t])), [tasks])

  // 快捷任務(建立任務時可直接套用的範本)
  const presets = useMemo(
    () =>
      raw.presets.map((p) => ({
        ...p,
        assigned_to_id: p.assigned_to,
        assigned_to: p.shared ? 'both' : p.assigned_to ? codeOf(p.assigned_to) : null,
        choices: p.choices ?? [],
        reward: p.reward_id ? rewardsById[p.reward_id] ?? null : null,
        category: p.category_id ? categoriesById[p.category_id] ?? null : null,
      })),
    [raw.presets, rewardsById, categoriesById, codeOf],
  )

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
  const rpc = useCallback((fn, args) => mutate({ type: 'rpc', fn, args }), [mutate])
  const insertRow = useCallback(
    (table, row) => {
      const full = { id: newId(), ...row }
      mutate({ type: 'insert', table, row: full })
      return full
    },
    [mutate],
  )
  const updateRow = useCallback((table, id, row) => mutate({ type: 'update', table, id, row }), [mutate])
  const deleteRow = useCallback((table, id) => mutate({ type: 'delete', table, id }), [mutate])

  // ---------- 寫入:任務 ----------
  /** 選項清單:去除空白、空字串,沒有選項就回 null(對應資料庫欄位) */
  const normalizeChoices = (arr) => {
    const list = (arr ?? []).map((s) => String(s).trim()).filter(Boolean)
    return list.length ? list : null
  }

  const toTaskRow = useCallback(
    (input) => {
      const row = {
        title: input.title.trim(),
        description: input.description?.trim() ?? '',
        image_urls: input.image_urls ?? [],
        category_id: input.category_id || null,
        priority: Math.min(5, Math.max(1, Number(input.priority) || 3)),
        choices: normalizeChoices(input.choices),
        assigned_to: input.assigned_to === 'both' ? null : idOf(input.assigned_to),
        shared: input.assigned_to === 'both',
        reward_type: input.reward_type ?? 'points',
        reward_points: input.reward_type === 'points' ? Number(input.reward_points) || 0 : 0,
        reward_id: input.reward_type === 'reward' ? input.reward_id || null : null,
        due_date: input.due_date || null,
        recurrence_rule: input.recurrence_rule ?? null,
      }
      // 週期任務:規則裡帶著「系列範本」,之後每一期都照範本產生;
      // 若傳進來的規則已經有範本(只改這一期),就原樣保留
      if (row.recurrence_rule && !row.recurrence_rule.template) {
        row.recurrence_rule = {
          ...row.recurrence_rule,
          template: {
            title: row.title,
            description: row.description,
            image_urls: row.image_urls,
            category_id: row.category_id,
            priority: row.priority,
            choices: row.choices,
            reward_type: row.reward_type,
            reward_points: row.reward_points,
            reward_id: row.reward_id,
          },
        }
      }
      return row
    },
    [idOf],
  )

  const createTask = useCallback(
    async (input) => insertRow('tasks', { ...toTaskRow(input), created_by: userId, status: 'pending' }),
    [toTaskRow, userId, insertRow],
  )
  const updateTask = useCallback(async (id, input) => updateRow('tasks', id, toTaskRow(input)), [toTaskRow, updateRow])
  /** 編輯整個系列:所有進行中的期別一起更新內容與規則(範本一併更新) */
  const updateSeries = useCallback(
    async (id, input) => {
      const { due_date: _due, recurrence_rule, ...fields } = toTaskRow(input)
      rpc('update_series', { p_task_id: id, p_fields: fields, p_rule: recurrence_rule })
      const t = tasksById[id]
      const root = t ? t.parent_task_id ?? t.id : id
      return tasks.filter((x) => (x.parent_task_id ?? x.id) === root && (x.status === 'pending' || x.status === 'rejected')).length
    },
    [toTaskRow, rpc, tasks, tasksById],
  )
  const deleteTask = useCallback(
    async (id) => {
      const task = tasksById[id]
      deleteRow('tasks', id)
      if (task?.image_urls?.length) deleteImages(task.image_urls).catch(() => {})
    },
    [tasksById, deleteRow],
  )

  const submitTask = useCallback(
    async (id, choice, note) => rpc('submit_task', { p_task_id: id, p_choice: choice ?? null, p_note: note ?? null }),
    [rpc],
  )
  /** 修改任務(每日任務每一期)的說明 */
  const setTaskNote = useCallback(async (id, note) => rpc('set_task_note', { p_task_id: id, p_note: note ?? '' }), [rpc])
  const approveTask = useCallback(async (id) => rpc('approve_task', { p_task_id: id }), [rpc])
  /** 撤回自己送出的審核:回到待完成,可再編輯 */
  const withdrawTask = useCallback(async (id) => rpc('withdraw_task', { p_task_id: id }), [rpc])
  const rejectTask = useCallback(async (id, reason) => rpc('reject_task', { p_task_id: id, p_reason: reason ?? '' }), [rpc])
  const stopRecurrence = useCallback(async (id) => rpc('stop_recurrence', { p_task_id: id }), [rpc])

  // ---------- 寫入:獎勵與兌換 ----------
  const toRewardRow = (input) => ({
    redeemable: input.redeemable ?? true,
    name: input.name.trim(),
    description: input.description?.trim() ?? '',
    image_urls: input.image_urls ?? [],
    category_id: input.category_id || null,
    cost_points: Number(input.cost_points) || 0,
    stock: -1, // 不做限量,一律無限供應
    is_active: input.is_active ?? true,
  })

  const createReward = useCallback(
    async (input) => insertRow('rewards', { ...toRewardRow(input), created_by: userId }),
    [userId, insertRow],
  )
  const updateReward = useCallback(async (id, input) => updateRow('rewards', id, toRewardRow(input)), [updateRow])

  const requestRedemption = useCallback(
    async (rewardId) => {
      const r = rewardsById[rewardId]
      if (r && r.redeemable === false) throw new Error('這個獎勵不開放積分兌換')
      if (r && balanceOf(user) - reservedOf(user) < r.cost_points) throw new Error('積分不足')
      rpc('request_redemption', { p_reward_id: rewardId })
    },
    [rpc, rewardsById, balanceOf, reservedOf, user],
  )
  const fulfillRedemption = useCallback(async (id) => rpc('fulfill_redemption', { p_redemption_id: id }), [rpc])
  const rejectRedemption = useCallback(
    async (id, reason) => rpc('reject_redemption', { p_redemption_id: id, p_reason: reason ?? '' }),
    [rpc],
  )

  // ---------- 寫入:類別 ----------
  /** 新增類別;parent_id 有值即為次類別 */
  const createCategory = useCallback(
    async ({ kind, name, parent_id = null }) => {
      const sort_order = categories.filter((c) => c.kind === kind && (c.parent_id ?? null) === parent_id).length
      return insertRow('categories', { kind, name: name.trim(), parent_id, sort_order, created_by: userId })
    },
    [categories, userId, insertRow],
  )
  const updateCategory = useCallback(async (id, { name }) => updateRow('categories', id, { name: name.trim() }), [updateRow])
  const deleteCategory = useCallback(
    async (id) => {
      // 主類別刪除時連同次類別(資料庫 on delete cascade;本機先一起拿掉)
      categories.filter((c) => c.parent_id === id).forEach((c) => deleteRow('categories', c.id))
      deleteRow('categories', id)
    },
    [categories, deleteRow],
  )

  // ---------- 寫入:快捷任務 ----------
  const toPresetRow = (input) => ({
    title: input.title.trim(),
    description: input.description?.trim() ?? '',
    category_id: input.category_id || null,
    assigned_to: input.assigned_to && input.assigned_to !== 'both' ? idOf(input.assigned_to) : null,
    shared: input.assigned_to === 'both',
    priority: Math.min(5, Math.max(1, Number(input.priority) || 3)),
    choices: normalizeChoices(input.choices),
    reward_type: input.reward_type ?? 'points',
    reward_points: input.reward_type === 'points' ? Number(input.reward_points) || 0 : 0,
    reward_id: input.reward_type === 'reward' ? input.reward_id || null : null,
  })

  const createPreset = useCallback(
    async (input) => insertRow('task_presets', { ...toPresetRow(input), sort_order: presets.length, created_by: userId }),
    [presets.length, userId, insertRow],
  )
  const updatePreset = useCallback(async (id, input) => updateRow('task_presets', id, toPresetRow(input)), [updateRow])
  const deletePreset = useCallback(async (id) => deleteRow('task_presets', id), [deleteRow])

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
      // 同步狀態
      pending: outbox.length,
      offline,
      syncing,
      sync: flush,
      tasks,
      ledger,
      rewards,
      redemptions,
      categories,
      categoriesById,
      presets,
      createPreset,
      updatePreset,
      deletePreset,
      balanceOf,
      reservedOf,
      createTask,
      updateTask,
      updateSeries,
      deleteTask,
      submitTask,
      setTaskNote,
      approveTask,
      withdrawTask,
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
      outbox.length, offline, syncing, flush,
      tasks, ledger, rewards, redemptions, categories, categoriesById, presets, createPreset, updatePreset, deletePreset, balanceOf, reservedOf,
      createTask, updateTask, updateSeries, deleteTask, submitTask, setTaskNote, approveTask, withdrawTask, rejectTask, stopRecurrence,
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
