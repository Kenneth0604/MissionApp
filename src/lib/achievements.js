// 連續達成天數與成就徽章(純函式,方便測試)。
// 「達成」= 該使用者有一筆因任務核准而得到的正分紀錄(related_task_id 有值、amount > 0)。
// 日期以 App 的「今天」計算:凌晨 3 點才換日,和 appTodayISO() 一致。

const pad = (n) => String(n).padStart(2, '0')

export function appDayOf(iso) {
  const d = new Date(new Date(iso).getTime() - 3 * 60 * 60 * 1000)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function prevDay(day) {
  const [y, m, d] = day.split('-').map(Number)
  const t = new Date(y, m - 1, d - 1)
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`
}

const isCompletion = (l) => l.amount > 0 && l.related_task_id

export function statsFor(ledger, user, now = new Date()) {
  const mine = ledger.filter((l) => l.user_id === user)
  const done = mine.filter(isCompletion)
  const days = new Set(done.map((l) => appDayOf(l.created_at)))
  const today = appDayOf(now)

  // 目前連續:今天還沒做不算斷,從今天(或昨天)往回數
  let current = 0
  let cursor = days.has(today) ? today : prevDay(today)
  while (days.has(cursor)) { current++; cursor = prevDay(cursor) }

  // 最佳連續
  let best = 0
  for (const day of days) {
    if (days.has(prevDay(day))) continue // 只從每段的第一天開始數
    let len = 0
    let c = day
    for (;;) {
      len++
      const [y, m, d] = c.split('-').map(Number)
      const n = new Date(y, m - 1, d + 1)
      c = `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`
      if (!days.has(c)) break
    }
    best = Math.max(best, len)
  }

  return {
    current,
    best,
    doneToday: days.has(today),
    completions: done.length,
    earned: mine.reduce((s, l) => s + (l.amount > 0 ? l.amount : 0), 0),
    helped: done.filter((l) => String(l.reason || '').startsWith('幫忙完成')).length,
  }
}

// 徽章:tier 決定顏色(銅、銀、金、彩虹)
export const BADGES = [
  { id: 'first', icon: '🌱', name: '第一步', desc: '完成第一個任務', tier: 0, test: (s) => s.completions >= 1, progress: (s) => [s.completions, 1] },
  { id: 'streak3', icon: '🔥', name: '三天不斷', desc: '連續 3 天完成任務', tier: 0, test: (s) => s.best >= 3, progress: (s) => [s.best, 3] },
  { id: 'streak7', icon: '⚡️', name: '一週全勤', desc: '連續 7 天完成任務', tier: 1, test: (s) => s.best >= 7, progress: (s) => [s.best, 7] },
  { id: 'streak30', icon: '👑', name: '月度傳說', desc: '連續 30 天完成任務', tier: 3, test: (s) => s.best >= 30, progress: (s) => [s.best, 30] },
  { id: 'tasks10', icon: '✅', name: '十全十美', desc: '累積完成 10 個任務', tier: 0, test: (s) => s.completions >= 10, progress: (s) => [s.completions, 10] },
  { id: 'tasks50', icon: '🏅', name: '任務達人', desc: '累積完成 50 個任務', tier: 1, test: (s) => s.completions >= 50, progress: (s) => [s.completions, 50] },
  { id: 'tasks100', icon: '🏆', name: '百戰百勝', desc: '累積完成 100 個任務', tier: 2, test: (s) => s.completions >= 100, progress: (s) => [s.completions, 100] },
  { id: 'points100', icon: '💎', name: '百分俱樂部', desc: '累積賺到 100 分', tier: 1, test: (s) => s.earned >= 100, progress: (s) => [s.earned, 100] },
  { id: 'points1000', icon: '🌟', name: '千分巨星', desc: '累積賺到 1000 分', tier: 2, test: (s) => s.earned >= 1000, progress: (s) => [s.earned, 1000] },
  { id: 'helper', icon: '🤝', name: '神隊友', desc: '幫對方完成 5 個任務', tier: 1, test: (s) => s.helped >= 5, progress: (s) => [s.helped, 5] },
]

export function badgesFor(stats) {
  return BADGES.map((b) => {
    const [have, need] = b.progress(stats)
    return { ...b, unlocked: b.test(stats), have: Math.min(have, need), need }
  })
}
