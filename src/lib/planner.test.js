import { describe, expect, it } from 'vitest'
import {
  addParsed,
  buildTimeline,
  cnToInt,
  demoState,
  expandRange,
  fmtTime,
  interleave,
  intToCn,
  locateNow,
  newEntry,
  paceOf,
  parseQuickAdd,
  parseTimeFlag,
  reduce,
} from './planner.js'

describe('中文數字', () => {
  it('轉換 1~99', () => {
    expect(['一', '十', '十五', '二十', '二十三', '兩'].map(cnToInt)).toEqual([1, 10, 15, 20, 23, 2])
    expect([1, 10, 15, 20, 23].map(intToCn)).toEqual(['一', '十', '十五', '二十', '二十三'])
  })
})

describe('expandRange', () => {
  it('阿拉伯數字範圍', () => {
    expect(expandRange('第1-3題')).toEqual(['第1題', '第2題', '第3題'])
    expect(expandRange('Ch1~2')).toEqual(['Ch1', 'Ch2'])
  })
  it('中文數字範圍', () => {
    expect(expandRange('第一題~第三題')).toEqual(['第一題', '第二題', '第三題'])
    expect(expandRange('第九到十一題')).toEqual(['第九題', '第十題', '第十一題'])
  })
  it('不是範圍就原樣', () => {
    expect(expandRange('爬音階')).toEqual(['爬音階'])
    expect(expandRange('第3-1題')).toEqual(['第3-1題'])
  })
})

describe('parseQuickAdd', () => {
  it('三層 + 分鐘 + 範圍', () => {
    expect(parseQuickAdd('作業/數學/第1-2題 15分')).toEqual([
      { group: '作業', sub: '數學', title: '第1題', minutes: 15 },
      { group: '作業', sub: '數學', title: '第2題', minutes: 15 },
    ])
  })
  it('兩層、一層', () => {
    expect(parseQuickAdd('家事 > 拖地\n散步')).toEqual([
      { group: '家事', sub: '', title: '拖地', minutes: null },
      { group: '其他', sub: '', title: '散步', minutes: null },
    ])
  })
})

describe('排程', () => {
  it('自動穿插依主類別輪流,並插入休息', () => {
    const s = interleave(demoState(), { breakEvery: 3, breakMinutes: 5 })
    const byId = Object.fromEntries(s.items.map((i) => [i.id, i]))
    const seq = s.schedule.slice(0, 5).map((e) => (e.kind === 'break' ? '休息' : byId[e.itemId].title))
    expect(seq).toEqual(['第1題', '拖地', '爬音階', '休息', '第2題'])
    expect(s.schedule.filter((e) => e.kind === 'task')).toHaveLength(s.items.length)
  })

  it('同一個小塊不會重複排入;移動與時間軸', () => {
    let s = demoState()
    const [a, b] = s.items
    s = reduce(s, { type: 'insert', index: 0, entry: newEntry('task', { itemId: a.id }) })
    s = reduce(s, { type: 'insert', index: 0, entry: newEntry('task', { itemId: a.id }) })
    expect(s.schedule).toHaveLength(1)
    s = reduce(s, { type: 'insert', index: 0, entry: newEntry('break', { minutes: 5 }) })
    s = reduce(s, { type: 'insert', index: 99, entry: newEntry('task', { itemId: b.id }) })
    s = reduce(s, { type: 'move', id: s.schedule[0].id, index: 2 })
    expect(s.schedule.map((e) => e.kind)).toEqual(['task', 'task', 'break'])
    expect(buildTimeline(s).map((r) => fmtTime(r.start))).toEqual(['19:00', '19:15', '19:30'])
  })

  it('刪除主類別會一併移出排程', () => {
    let s = interleave(demoState())
    const gid = s.groups[0].id
    s = reduce(s, { type: 'deleteGroup', id: gid })
    expect(s.items.some((i) => i.groupId === gid)).toBe(false)
    expect(s.schedule).toHaveLength(s.items.length)
  })
})

describe('時間可選 + 時間點旗標', () => {
  it('parseTimeFlag', () => {
    expect(['12:00', '9：30', '@7:05', '12點', '3點半', '十點', '8點15分'].map(parseTimeFlag)).toEqual([
      '12:00', '09:30', '07:05', '12:00', '03:30', '10:00', '08:15',
    ])
    expect(['24:00', '12:60', '作業/數學', '12'].map(parseTimeFlag)).toEqual([null, null, null, null])
  })

  it('沒填分鐘的小塊 minutes 為 null,時間軸當 0 算', () => {
    let s = addParsed({ groups: [], items: [], schedule: [], startTime: '09:00' }, parseQuickAdd('家事/拖地\n家事/洗碗 10分'))
    expect(s.items.map((i) => i.minutes)).toEqual([null, 10])
    s = interleave(s)
    const rows = buildTimeline(s)
    expect(rows.map((r) => [fmtTime(r.start), r.minutes])).toEqual([['09:00', null], ['09:00', 10]])
    s = reduce(s, { type: 'updateItem', id: s.items[1].id, groupName: '家事', sub: '', title: '洗碗', minutes: '' })
    expect(s.items[1].minutes).toBeNull()
  })

  it('旗標把時間對齊,並算出空檔 / 超時', () => {
    let s = addParsed({ groups: [], items: [], schedule: [], startTime: '11:00' }, parseQuickAdd('a/x 30分\na/y 40分\na/z'))
    const [x, y, z] = s.items
    const add = (entry) => (s = reduce(s, { type: 'insert', index: null, entry }))
    add(newEntry('task', { itemId: x.id }))
    add(newEntry('flag', { time: '12:00' }))
    add(newEntry('task', { itemId: y.id }))
    add(newEntry('flag', { time: '12:30' }))
    add(newEntry('task', { itemId: z.id }))
    add(newEntry('flag', { time: '13:00' }))
    const rows = buildTimeline(s)
    expect(rows.map((r) => fmtTime(r.start))).toEqual(['11:00', '12:00', '12:00', '12:30', '12:30', '13:00'])
    expect(rows.filter((r) => r.entry.kind === 'flag').map((r) => r.diff)).toEqual([30, -10, null])
  })
})

describe('現在時間', () => {
  const setup = () => {
    let s = addParsed({ groups: [], items: [], schedule: [], startTime: '10:00', timed: true }, parseQuickAdd('a/x 30分\na/y 30分'))
    s = interleave(s)
    s = reduce(s, { type: 'insert', index: null, entry: newEntry('flag', { time: '12:00' }) })
    return s
  }

  it('locateNow:在區塊裡、空檔、開始前、結束後', () => {
    const rows = buildTimeline(setup())
    expect(locateNow(rows, 10 * 60 + 15, true)).toEqual({ inside: rows[0].entry.id, frac: 0.5 })
    expect(locateNow(rows, 11 * 60 + 30, true)).toEqual({ before: 2 }) // 11:00 結束 → 12:00 旗標之間
    expect(locateNow(rows, 9 * 60, true)).toEqual({ before: 0 })
    expect(locateNow(rows, 13 * 60, true)).toEqual({ before: 3 })
  })

  it('時間軸關閉時只看旗標', () => {
    const rows = buildTimeline(setup())
    expect(locateNow(rows, 10 * 60 + 15, false)).toEqual({ before: 2 })
    expect(locateNow(rows, 13 * 60, false)).toBeNull()
  })

  it('paceOf:落後 / 超前幾塊', () => {
    let s = setup()
    const at = (min) => paceOf(buildTimeline(s), locateNow(buildTimeline(s), min, true))
    expect(at(10 * 60 + 40)).toBe(1) // 該做 y 了,x 還沒勾
    s = reduce(s, { type: 'toggleDone', id: s.schedule[0].id })
    s = reduce(s, { type: 'toggleDone', id: s.schedule[1].id })
    expect(at(10 * 60 + 5)).toBe(-2)
  })
})
