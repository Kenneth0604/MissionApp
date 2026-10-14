// 任務切塊排程(草稿):純邏輯,不依賴 React / Supabase,方便之後接到 store.jsx
//
// 三個階層:主類別(group,帶顏色) › 次類別(sub,可空白) › 任務小塊(item)
//   例:{ 作業 › 數學 › 第一題 }、{ 家事 › 拖地 }
// 排程(schedule)是有順序的區塊陣列:任務小塊(task)、休息(break)、時間點旗標(flag)
//   - 小塊的分鐘數可以不填(minutes: null)
//   - 時間軸預設關閉(state.timed);開啟後才顯示每塊的開始時間
//   - 旗標 { kind: 'flag', time: '12:00' } 把時間軸對齊到指定時間,後面的區塊從那裡接著算

export const PALETTE = ['#e86aa8', '#7c5cd6', '#16a37a', '#f59e0b', '#3b82f6', '#14b8a6', '#ef4444', '#8b5e3c']
export const DEFAULT_FLAG_TIME = '12:00'

const toMinutesOrNull = (v) => {
  if (v === '' || v == null) return null
  const n = Math.round(Number(v))
  return Number.isFinite(n) && n > 0 ? n : null
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)

export const newEntry = (kind, extra = {}) => ({ id: uid(), kind, done: false, ...extra })

// ------------------------------------------------------------------
// 中文數字(支援 1~99:一、十、十五、二十三、兩)
// ------------------------------------------------------------------
const CN = '零一二三四五六七八九'

export function cnToInt(s) {
  if (/^\d+$/.test(s)) return Number(s)
  s = s.replace(/兩/g, '二')
  if (s === '十') return 10
  const i = s.indexOf('十')
  if (i === -1) return s.length === 1 && CN.indexOf(s) > 0 ? CN.indexOf(s) : NaN
  if (s.length > i + 2) return NaN
  const tens = i === 0 ? 1 : CN.indexOf(s[0])
  const ones = i === s.length - 1 ? 0 : CN.indexOf(s[i + 1])
  if (tens < 1 || ones < 0 || i > 1) return NaN
  return tens * 10 + ones
}

export function intToCn(n) {
  if (n < 10) return CN[n]
  const t = Math.floor(n / 10)
  const o = n % 10
  return `${t === 1 ? '' : CN[t]}十${o ? CN[o] : ''}`
}

// ------------------------------------------------------------------
// 快速輸入:「作業/數學/第1-5題 15分」→ 5 個小塊
// ------------------------------------------------------------------
const NUM = '(\\d+|[一二三四五六七八九十兩]+)'
const RANGE = new RegExp(`^(\\D*?)${NUM}(\\D*?)\\s*[-~～到至]\\s*(\\D*?)${NUM}(\\D*)$`)

/** 「第1-3題」「第一題~第三題」「Ch1-3」展開成多個標題;不是範圍就原樣回傳 */
export function expandRange(title) {
  const m = title.match(RANGE)
  if (!m) return [title]
  const [, p1, a, s1, p2, b, s2] = m
  if (p2 && p2 !== p1) return [title]
  if (s1 && s2 && s1 !== s2) return [title]
  const from = cnToInt(a)
  const to = cnToInt(b)
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from || to - from > 50) return [title]
  const chinese = !/^\d/.test(a)
  const suffix = s2 || s1
  const out = []
  for (let n = from; n <= to; n++) out.push(`${p1}${chinese ? intToCn(n) : n}${suffix}`)
  return out
}

/**
 * 時間點旗標:「12:00」「9：30」「@12:00」「12點」「12點半」→ 'HH:MM';不是就回傳 null
 */
export function parseTimeFlag(text) {
  const s = String(text).trim().replace(/^[@🚩]\s*/u, '')
  let m = s.match(/^(\d{1,2})\s*[:：]\s*(\d{2})$/)
  let h, min
  if (m) {
    h = Number(m[1])
    min = Number(m[2])
  } else if ((m = s.match(/^(\d{1,2}|[一二三四五六七八九十兩]+)\s*[點点](半|(\d{1,2})分?)?$/))) {
    h = cnToInt(m[1])
    min = m[2] === '半' ? 30 : m[3] ? Number(m[3]) : 0
  } else return null
  if (!Number.isFinite(h) || h > 23 || min > 59) return null
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

const SEP = /\s*[/>›＞／]\s*/
const MINUTES = /\s+(\d+)\s*(?:m|min|mins|分|分鐘)$/i

/** 解析一行或多行快速輸入,回傳 [{ group, sub, title, minutes }] */
export function parseQuickAdd(text) {
  const out = []
  for (const raw of String(text).split(/\n/)) {
    let s = raw.trim()
    if (!s) continue
    let minutes = null
    const mm = s.match(MINUTES)
    if (mm) {
      minutes = Number(mm[1])
      s = s.slice(0, mm.index).trim()
    }
    const parts = s.split(SEP).map((p) => p.trim()).filter(Boolean)
    if (parts.length === 0) continue
    const title = parts.pop()
    const group = parts.shift() ?? '其他'
    const sub = parts.join(' › ')
    for (const t of expandRange(title)) out.push({ group, sub, title: t, minutes })
  }
  return out
}

// ------------------------------------------------------------------
// 查詢小工具
// ------------------------------------------------------------------
export const scheduledIds = (state) =>
  new Set(state.schedule.filter((e) => e.kind === 'task').map((e) => e.itemId))

/** 某主類別底下的次類別(依第一次出現的順序) */
export function subsOfGroup(state, groupId) {
  const subs = []
  for (const it of state.items) if (it.groupId === groupId && !subs.includes(it.sub)) subs.push(it.sub)
  return subs
}

/** 某主類別的小塊,依次類別分組後保持輸入順序 */
export function orderedItems(state, groupId) {
  const subs = subsOfGroup(state, groupId)
  return state.items
    .filter((it) => it.groupId === groupId)
    .sort((a, b) => subs.indexOf(a.sub) - subs.indexOf(b.sub))
}

function pickColor(groups) {
  const used = new Set(groups.map((g) => g.color))
  return PALETTE.find((c) => !used.has(c)) ?? PALETTE[groups.length % PALETTE.length]
}

function ensureGroup(groups, name) {
  const n = name.trim() || '其他'
  let g = groups.find((x) => x.name === n)
  if (!g) {
    g = { id: uid(), name: n, color: pickColor(groups) }
    groups.push(g)
  }
  return g
}

export function addParsed(state, parsed) {
  const groups = [...state.groups]
  const items = [...state.items]
  for (const p of parsed) {
    const g = ensureGroup(groups, p.group)
    items.push({ id: uid(), groupId: g.id, sub: p.sub ?? '', title: p.title, minutes: toMinutesOrNull(p.minutes) })
  }
  return { ...state, groups, items }
}

/**
 * 自動穿插:把還沒排的小塊依「主類別」輪流接到排程尾端
 *   作業 → 家事 → 吉他 → 作業 → ...,可每 N 塊插一段休息
 */
export function interleave(state, { breakEvery = 0, breakMinutes = 5 } = {}) {
  const scheduled = scheduledIds(state)
  const queues = state.groups
    .map((g) => orderedItems(state, g.id).filter((it) => !scheduled.has(it.id)))
    .filter((q) => q.length)
  const add = []
  let count = 0
  while (queues.some((q) => q.length)) {
    for (const q of queues) {
      if (!q.length) continue
      add.push(newEntry('task', { itemId: q.shift().id }))
      count++
      if (breakEvery > 0 && count % breakEvery === 0 && queues.some((x) => x.length)) {
        add.push(newEntry('break', { minutes: breakMinutes }))
      }
    }
  }
  return { ...state, schedule: [...state.schedule, ...add] }
}

// ------------------------------------------------------------------
// 時間軸
// ------------------------------------------------------------------
export const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm || '00:00').split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}
export const fmtTime = (min) =>
  `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

/**
 * 時間軸:每列 { entry, item, minutes, start }
 *   - minutes:任務/休息的分鐘數(任務沒填時為 null,當作 0 計算)
 *   - 旗標列會把時間對齊到旗標時間,並附上 diff = 旗標時間 − 前一段預計結束時間
 *     (正數 = 有空檔,負數 = 會超過);第一個區塊就是旗標、或中間有沒填分鐘的任務時 diff 為 null
 */
export function buildTimeline(state) {
  const byId = Object.fromEntries(state.items.map((i) => [i.id, i]))
  let t = toMinutes(state.startTime)
  let started = false
  let unknown = false // 上一個錨點之後有沒填分鐘的任務 → diff 不準
  return state.schedule.map((entry) => {
    if (entry.kind === 'flag') {
      const at = toMinutes(entry.time)
      const row = { entry, item: null, minutes: 0, start: at, diff: started && !unknown ? at - t : null }
      t = at
      started = true
      unknown = false
      return row
    }
    const item = entry.kind === 'task' ? byId[entry.itemId] ?? null : null
    const minutes = item ? item.minutes ?? null : entry.minutes ?? 0
    const row = { entry, item, minutes, start: t }
    t += minutes ?? 0
    if (minutes == null) unknown = true
    started = true
    return row
  })
}

/**
 * 現在時間落在排程的哪裡(now = 當天第幾分鐘,可帶小數)
 *   - { inside: entryId, frac }:正落在某個任務/休息裡,frac = 已經過的比例 0~1
 *   - { before: index }:落在第 index 列之前(空檔、還沒開始、或全部結束時 index = rows.length)
 *   - null:沒有可以對照的時間
 * 時間軸關閉時只有旗標有時間 → 放在第一個「還沒到」的旗標前面
 */
export function locateNow(rows, now, timed) {
  if (!rows.length) return null
  if (!timed) {
    const i = rows.findIndex((r) => r.entry.kind === 'flag' && r.start > now)
    return i === -1 ? null : { before: i }
  }
  for (const r of rows) {
    if (r.entry.kind !== 'flag' && r.minutes > 0 && r.start <= now && now < r.start + r.minutes) {
      return { inside: r.entry.id, frac: (now - r.start) / r.minutes }
    }
  }
  const i = rows.findIndex((r) => r.start > now)
  return { before: i === -1 ? rows.length : i }
}

/**
 * 照時間「應該」做到第幾塊 vs. 實際勾到第幾塊:回傳 behind(正 = 落後幾塊,負 = 超前)
 * 只算任務/休息;時間軸關閉或找不到位置時回傳 null
 */
export function paceOf(rows, loc) {
  if (!loc) return null
  const work = rows.filter((r) => r.entry.kind !== 'flag')
  const actual = work.findIndex((r) => !r.entry.done)
  const actualIdx = actual === -1 ? work.length : actual
  let expected
  if (loc.inside) expected = work.findIndex((r) => r.entry.id === loc.inside)
  else expected = rows.slice(0, loc.before).filter((r) => r.entry.kind !== 'flag').length
  return expected - actualIdx
}

// ------------------------------------------------------------------
// 顏色:主類別決定色系,次類別用同色系的深淺區分
// ------------------------------------------------------------------
const SHADES = [null, [72, 'black'], [62, 'white'], [55, 'black'], [48, 'white']]
export function shadeOf(color, subIndex = 0) {
  const s = SHADES[subIndex % SHADES.length]
  return s ? `color-mix(in srgb, ${color} ${s[0]}%, ${s[1]})` : color
}
export const tint = (color, pct = 16) => `color-mix(in srgb, ${color} ${pct}%, var(--t-surface))`

// ------------------------------------------------------------------
// Reducer
// ------------------------------------------------------------------
const clampIndex = (i, len) => (i == null || i < 0 || i > len ? len : i)

export function reduce(state, a) {
  switch (a.type) {
    case 'quickAdd':
      return addParsed(state, a.parsed)

    case 'addGroup': {
      const groups = [...state.groups]
      const g = ensureGroup(groups, a.name)
      return { ...state, groups }
    }

    case 'addItem': {
      const items = [...state.items]
      items.push({ id: uid(), groupId: a.groupId, sub: a.sub ?? '', title: a.title, minutes: toMinutesOrNull(a.minutes) })
      return { ...state, items }
    }

    case 'updateItem': {
      const groups = [...state.groups]
      const g = ensureGroup(groups, a.groupName)
      return {
        ...state,
        groups,
        items: state.items.map((it) =>
          it.id === a.id
            ? { ...it, groupId: g.id, sub: a.sub.trim(), title: a.title.trim() || it.title, minutes: toMinutesOrNull(a.minutes) }
            : it,
        ),
      }
    }

    case 'deleteItem':
      return {
        ...state,
        items: state.items.filter((it) => it.id !== a.id),
        schedule: state.schedule.filter((e) => e.itemId !== a.id),
      }

    case 'updateGroup':
      return { ...state, groups: state.groups.map((g) => (g.id === a.id ? { ...g, ...a.patch } : g)) }

    case 'deleteGroup': {
      const gone = new Set(state.items.filter((it) => it.groupId === a.id).map((it) => it.id))
      return {
        ...state,
        groups: state.groups.filter((g) => g.id !== a.id),
        items: state.items.filter((it) => !gone.has(it.id)),
        schedule: state.schedule.filter((e) => !gone.has(e.itemId)),
      }
    }

    case 'insert': {
      if (a.entry.kind === 'task' && scheduledIds(state).has(a.entry.itemId)) return state
      const schedule = [...state.schedule]
      schedule.splice(clampIndex(a.index, schedule.length), 0, a.entry)
      return { ...state, schedule }
    }

    case 'move': {
      const entry = state.schedule.find((e) => e.id === a.id)
      if (!entry) return state
      const schedule = state.schedule.filter((e) => e.id !== a.id)
      schedule.splice(clampIndex(a.index, schedule.length), 0, entry)
      return { ...state, schedule }
    }

    case 'remove':
      return { ...state, schedule: state.schedule.filter((e) => e.id !== a.id) }

    case 'toggleDone':
      return { ...state, schedule: state.schedule.map((e) => (e.id === a.id ? { ...e, done: !e.done } : e)) }

    case 'updateEntry':
      return { ...state, schedule: state.schedule.map((e) => (e.id === a.id ? { ...e, ...a.patch } : e)) }

    case 'resetDone':
      return { ...state, schedule: state.schedule.map((e) => ({ ...e, done: false })) }

    case 'clearSchedule':
      return { ...state, schedule: [] }

    case 'interleave':
      return interleave(state, a.opts)

    case 'setStart':
      return { ...state, startTime: a.value }

    case 'setTimed':
      return { ...state, timed: Boolean(a.value) }

    case 'reset':
      return demoState()

    default:
      return state
  }
}

export const DEMO_TEXT = `作業/數學/第1-4題 15分
作業/英文/背單字 10分
作業/英文/閱讀測驗 20分
家事/拖地 15分
家事/洗碗 10分
家事/倒垃圾
吉他/基本功/爬音階 10分
吉他/基本功/和弦轉換 10分
吉他/曲子/小星星 15分`

export function demoState() {
  return addParsed({ groups: [], items: [], schedule: [], startTime: '19:00', timed: false }, parseQuickAdd(DEMO_TEXT))
}

export function emptyState() {
  return { groups: [], items: [], schedule: [], startTime: '19:00', timed: false }
}
