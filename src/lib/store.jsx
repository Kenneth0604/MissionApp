import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

/**
 * 資料層(Prototype 版)
 * ----------------------------------------------------------------
 * 目前以 localStorage 模擬 Supabase 資料表:users / tasks / points_ledger。
 * 之後接 Supabase 時,只需把這裡的 login / createTask / approveTask ...
 * 換成呼叫 supabase-js,頁面元件不需改動。
 *
 * 注意:MOCK_PASSWORDS 只是 prototype 用,正式版密碼會雜湊存在 Supabase,
 * 由 Edge Function / pgcrypto 比對,不會出現在前端程式碼中。
 */

const DATA_KEY = 'missionapp:data:v1'
const SESSION_KEY = 'missionapp:session:v1'
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 天

export const USERS = [
  { id: 'A', name: 'A' },
  { id: 'B', name: 'B' },
]
const MOCK_PASSWORDS = { A: '1234', B: '1234' }

export const STATUS_LABEL = {
  pending: '待完成',
  submitted: '待審核',
  approved: '已核准',
  rejected: '已退回',
}

export const otherUser = (id) => (id === 'A' ? 'B' : 'A')

const uid = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
const nowIso = () => new Date().toISOString()

// ---------- 種子資料(第一次開啟時) ----------
function seed() {
  const t = nowIso()
  const tasks = [
    {
      id: uid(), title: '倒垃圾', description: '週三晚上記得倒垃圾與回收',
      created_by: 'A', assigned_to: 'B', reward_points: 10, status: 'pending',
      due_date: null, recurrence_rule: { freq: 'weekly', day_of_week: 3, active: true },
      reject_reason: null, created_at: t, updated_at: t,
    },
    {
      id: uid(), title: '整理書桌', description: '把桌面雜物歸位',
      created_by: 'B', assigned_to: 'A', reward_points: 15, status: 'submitted',
      due_date: null, recurrence_rule: null, reject_reason: null, created_at: t, updated_at: t,
    },
    {
      id: uid(), title: '洗碗', description: '',
      created_by: 'A', assigned_to: 'B', reward_points: 5, status: 'approved',
      due_date: null, recurrence_rule: null, reject_reason: null, created_at: t, updated_at: t,
    },
  ]
  const approved = tasks[2]
  const ledger = [
    {
      id: uid(), user_id: 'B', amount: 5, reason: `任務完成:${approved.title}`,
      related_task_id: approved.id, related_redemption_id: null, created_at: t,
    },
  ]
  return { tasks, ledger }
}

function loadData() {
  try {
    const raw = localStorage.getItem(DATA_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    /* ignore */
  }
  return seed()
}
function saveData(data) {
  try {
    localStorage.setItem(DATA_KEY, JSON.stringify(data))
  } catch {
    /* ignore */
  }
}
function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const s = JSON.parse(raw)
    if (!s.expiresAt || Date.now() > s.expiresAt) {
      localStorage.removeItem(SESSION_KEY)
      return null
    }
    return s
  } catch {
    return null
  }
}

// ---------- 重複任務:計算下一期到期日 ----------
export function nextDueDate(rule, fromDate) {
  if (!rule) return null
  const base = fromDate ? new Date(fromDate) : new Date()
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate())
  if (rule.freq === 'daily') {
    d.setDate(d.getDate() + 1)
  } else if (rule.freq === 'weekly') {
    const target = Number(rule.day_of_week ?? d.getDay())
    let diff = (target - d.getDay() + 7) % 7
    if (diff === 0) diff = 7
    d.setDate(d.getDate() + diff)
  }
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// ---------- Context ----------
const StoreContext = createContext(null)

export function StoreProvider({ children }) {
  const [data, setData] = useState(loadData)
  const [session, setSession] = useState(loadSession)

  useEffect(() => saveData(data), [data])

  const user = session?.userId ?? null

  // ---- 身分 ----
  const login = useCallback(async (userId, password) => {
    if (MOCK_PASSWORDS[userId] !== password) throw new Error('密碼錯誤')
    const s = { userId, token: uid(), expiresAt: Date.now() + SESSION_TTL_MS }
    localStorage.setItem(SESSION_KEY, JSON.stringify(s))
    setSession(s)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(SESSION_KEY)
    setSession(null)
  }, [])

  // ---- 任務 ----
  const mutateTask = useCallback((id, fn) => {
    setData((d) => ({
      ...d,
      tasks: d.tasks.map((t) => (t.id === id ? { ...t, ...fn(t), updated_at: nowIso() } : t)),
    }))
  }, [])

  const createTask = useCallback(
    (input) => {
      const t = nowIso()
      const task = {
        id: uid(),
        title: input.title.trim(),
        description: input.description?.trim() ?? '',
        created_by: user,
        assigned_to: input.assigned_to,
        reward_points: Number(input.reward_points) || 0,
        status: 'pending',
        due_date: input.due_date || null,
        recurrence_rule: input.recurrence_rule ?? null,
        reject_reason: null,
        created_at: t,
        updated_at: t,
      }
      setData((d) => ({ ...d, tasks: [task, ...d.tasks] }))
      return task
    },
    [user],
  )

  const updateTask = useCallback((id, patch) => mutateTask(id, () => patch), [mutateTask])

  const deleteTask = useCallback((id) => {
    setData((d) => ({ ...d, tasks: d.tasks.filter((t) => t.id !== id) }))
  }, [])

  const submitTask = useCallback((id) => mutateTask(id, () => ({ status: 'submitted' })), [mutateTask])

  const rejectTask = useCallback(
    (id, reason) =>
      mutateTask(id, () => ({ status: 'rejected', reject_reason: reason?.trim() || '未填寫原因' })),
    [mutateTask],
  )

  const approveTask = useCallback((id) => {
    setData((d) => {
      const task = d.tasks.find((t) => t.id === id)
      if (!task || task.status !== 'submitted') return d
      const t = nowIso()
      const tasks = d.tasks.map((x) =>
        x.id === id ? { ...x, status: 'approved', reject_reason: null, updated_at: t } : x,
      )
      const ledger = [
        {
          id: uid(),
          user_id: task.assigned_to,
          amount: task.reward_points,
          reason: `任務完成:${task.title}`,
          related_task_id: task.id,
          related_redemption_id: null,
          created_at: t,
        },
        ...d.ledger,
      ]
      // 重複任務:核准後才產生下一期
      const rule = task.recurrence_rule
      if (rule && rule.active !== false) {
        tasks.unshift({
          ...task,
          id: uid(),
          status: 'pending',
          reject_reason: null,
          due_date: nextDueDate(rule, task.due_date),
          created_at: t,
          updated_at: t,
        })
      }
      return { ...d, tasks, ledger }
    })
  }, [])

  const stopRecurrence = useCallback(
    (id) =>
      mutateTask(id, (t) => ({
        recurrence_rule: t.recurrence_rule ? { ...t.recurrence_rule, active: false } : null,
      })),
    [mutateTask],
  )

  // ---- 積分 ----
  const balanceOf = useCallback(
    (userId) => data.ledger.filter((l) => l.user_id === userId).reduce((s, l) => s + l.amount, 0),
    [data.ledger],
  )

  const resetDemo = useCallback(() => setData(seed()), [])

  const value = useMemo(
    () => ({
      user,
      login,
      logout,
      tasks: data.tasks,
      ledger: data.ledger,
      createTask,
      updateTask,
      deleteTask,
      submitTask,
      approveTask,
      rejectTask,
      stopRecurrence,
      balanceOf,
      resetDemo,
    }),
    [user, login, logout, data, createTask, updateTask, deleteTask, submitTask, approveTask, rejectTask, stopRecurrence, balanceOf, resetDemo],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore 必須在 StoreProvider 內使用')
  return ctx
}
