import { describe, expect, it } from 'vitest'
import { appDayOf, badgesFor, statsFor } from './achievements.js'

// 用本地時間建立 ISO 字串,避免時區影響
const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).toISOString()
const done = (user, iso, amount = 10, reason = '任務完成:x') => ({ id: Math.random(), user_id: user, amount, reason, related_task_id: 't', created_at: iso })

describe('appDayOf', () => {
  it('凌晨 3 點前算前一天', () => {
    expect(appDayOf(at(2026, 10, 27, 2))).toBe('2026-10-26')
    expect(appDayOf(at(2026, 10, 27, 4))).toBe('2026-10-27')
  })
})

describe('statsFor', () => {
  const now = new Date(2026, 9, 27, 20)
  it('今天還沒做時從昨天往回數', () => {
    const l = [done('a', at(2026, 10, 24)), done('a', at(2026, 10, 25)), done('a', at(2026, 10, 26))]
    const s = statsFor(l, 'a', now)
    expect(s.current).toBe(3)
    expect(s.doneToday).toBe(false)
  })
  it('斷掉一天就歸零,但最佳紀錄保留', () => {
    const l = [done('a', at(2026, 10, 1)), done('a', at(2026, 10, 2)), done('a', at(2026, 10, 3)), done('a', at(2026, 10, 3, 18)), done('a', at(2026, 10, 27))]
    const s = statsFor(l, 'a', now)
    expect(s.current).toBe(1)
    expect(s.best).toBe(3)
    expect(s.completions).toBe(5)
  })
  it('跨月份連續', () => {
    const l = [done('a', at(2026, 9, 30)), done('a', at(2026, 10, 1))]
    expect(statsFor(l, 'a', new Date(2026, 9, 1, 20)).current).toBe(2)
  })
  it('只算自己的、正分且來自任務的紀錄', () => {
    const l = [done('b', at(2026, 10, 27)), { id: 1, user_id: 'a', amount: -20, reason: '兌換', related_task_id: null, created_at: at(2026, 10, 27) }, { id: 2, user_id: 'a', amount: 5, reason: '調整', related_task_id: null, created_at: at(2026, 10, 27) }]
    const s = statsFor(l, 'a', now)
    expect(s.current).toBe(0)
    expect(s.completions).toBe(0)
    expect(s.earned).toBe(5)
  })
  it('幫忙完成的次數', () => {
    const l = [done('a', at(2026, 10, 27), 20, '幫忙完成任務(雙倍):x')]
    expect(statsFor(l, 'a', now).helped).toBe(1)
  })
})

describe('badgesFor', () => {
  it('解鎖與進度', () => {
    const b = badgesFor({ current: 2, best: 4, completions: 12, earned: 90, helped: 0 })
    const get = (id) => b.find((x) => x.id === id)
    expect(get('streak3').unlocked).toBe(true)
    expect(get('streak7')).toMatchObject({ unlocked: false, have: 4, need: 7 })
    expect(get('tasks10').unlocked).toBe(true)
    expect(get('points100').have).toBe(90)
  })
})
