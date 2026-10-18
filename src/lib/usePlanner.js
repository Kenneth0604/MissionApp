import { useEffect, useReducer } from 'react'
import { dailyReset, emptyState, plannerTodayISO, reduce } from './planner.js'

// 草稿階段先存在本機(尚未同步雲端);每個帳號各自一份,key 帶帳號 id
const keyOf = (userId) => `missionapp:planner:v2:${userId}`
const LEGACY_KEY = 'missionapp:planner-draft:v1' // 舊版所有帳號共用的資料,已作廢並清除

function load(userId) {
  try {
    localStorage.removeItem(LEGACY_KEY)
    const s = JSON.parse(localStorage.getItem(keyOf(userId)))
    // 開啟時若已經跨日,先清掉前一天的排程與任務(只留主類別)
    if (s && Array.isArray(s.groups) && Array.isArray(s.items) && Array.isArray(s.schedule)) return dailyReset(s)
  } catch {
    /* ignore */
  }
  return emptyState()
}

/** userId:目前登入的帳號;換帳號時呼叫端要用 key 重新掛載,才會讀到另一個帳號的資料 */
export function usePlanner(userId) {
  const [state, dispatch] = useReducer(reduce, userId, load)

  useEffect(() => {
    try {
      localStorage.setItem(keyOf(userId), JSON.stringify(state))
    } catch {
      /* ignore */
    }
  }, [state, userId])

  // App 開著跨過凌晨 3 點、或從背景切回來時,也要換日清除
  useEffect(() => {
    const check = () => dispatch({ type: 'dailyReset', today: plannerTodayISO() })
    const onVisible = () => document.visibilityState === 'visible' && check()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', check)
    const timer = setInterval(check, 60 * 1000)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', check)
      clearInterval(timer)
    }
  }, [])

  return [state, dispatch]
}
