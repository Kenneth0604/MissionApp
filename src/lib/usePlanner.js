import { useEffect, useReducer } from 'react'
import { emptyState, reduce } from './planner.js'

// 草稿階段先存在本機;正式整合時改接 store.jsx / Supabase
const KEY = 'missionapp:planner-draft:v1'

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY))
    if (s && Array.isArray(s.groups) && Array.isArray(s.items) && Array.isArray(s.schedule)) return s
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
  return [state, dispatch]
}
