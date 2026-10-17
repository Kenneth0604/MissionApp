import { useEffect, useReducer } from 'react'
import { dailyReset, emptyState, plannerTodayISO, reduce } from './planner.js'

// 草稿階段先存在本機;正式整合時改接 store.jsx / Supabase
const KEY = 'missionapp:planner-draft:v1'

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY))
    // 開啟時若已經跨日,先清掉前一天的排程與任務(只留主類別)
    if (s && Array.isArray(s.groups) && Array.isArray(s.items) && Array.isArray(s.schedule)) return dailyReset(s)
  } catch {
    /* ignore */
  }
  return emptyState()
}

export function usePlanner() {
  const [state, dispatch] = useReducer(reduce, null, load)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state))
    } catch {
      /* ignore */
    }
  }, [state])

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
