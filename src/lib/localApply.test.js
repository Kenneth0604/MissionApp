import { describe, it, expect } from 'vitest'
import { applyLocal, newId } from './localApply.js'

/**
 * Fixture 建構器:
 *   const f = fixture()
 *   const t = f.task({ assigned_to: A, reward_points: 10 })
 *   const next = f.apply({ type: 'rpc', fn: 'approve_task', args: { p_task_id: t.id } })
 * 每次 apply 都會先把輸入深凍結並快照,確認 reducer 不會改動輸入。
 */
const A = 'user-a'
const B = 'user-b'
const ctx = { userId: A }

function deepFreeze(obj) {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj)
    Object.values(obj).forEach(deepFreeze)
  }
  return obj
}

function fixture() {
  const raw = { tasks: [], ledger: [], rewards: [], redemptions: [], categories: [], presets: [] }
  let seq = 0
  const api = {
    raw,
    task(extra = {}) {
      const t = {
        id: `t${++seq}`,
        title: `任務${seq}`,
        status: 'pending',
        assigned_to: A,
        shared: false,
        completed_by: null,
        reward_type: 'points',
        reward_points: 10,
        reward_id: null,
        recurrence_rule: null,
        parent_task_id: null,
        note: null,
        ...extra,
      }
      raw.tasks.push(t)
      return t
    },
    reward(extra = {}) {
      const r = { id: `r${++seq}`, name: `獎勵${seq}`, cost_points: 50, ...extra }
      raw.rewards.push(r)
      return r
    },
    redemption(extra = {}) {
      const d = { id: `d${++seq}`, reward_id: null, requested_by: B, status: 'requested', cost_points: 50, source: 'redeem', ...extra }
      raw.redemptions.push(d)
      return d
    },
    /** 套用操作,並斷言輸入未被改動 */
    apply(op, c = ctx) {
      const snapshot = JSON.stringify(raw)
      deepFreeze(raw)
      const next = applyLocal(raw, op, c)
      expect(JSON.stringify(raw)).toBe(snapshot)
      return next
    },
  }
  return api
}

const rpc = (fn, args) => ({ type: 'rpc', fn, args })
const findTask = (raw, id) => raw.tasks.find((t) => t.id === id)

describe('insert', () => {
  it('tasks 與 redemptions 插在最前面', () => {
    const f = fixture()
    const existing = f.task()
    const next = f.apply({ type: 'insert', table: 'tasks', row: { id: 'new', title: '新任務' } })
    expect(next.tasks.map((t) => t.id)).toEqual(['new', existing.id])

    const f2 = fixture()
    const d = f2.redemption()
    const next2 = f2.apply({ type: 'insert', table: 'redemptions', row: { id: 'dnew' } })
    expect(next2.redemptions.map((x) => x.id)).toEqual(['dnew', d.id])
  })

  it('rewards / categories / task_presets 加在最後面(並對應到正確的 key)', () => {
    const f = fixture()
    f.reward()
    f.raw.categories.push({ id: 'c1' })
    f.raw.presets.push({ id: 'p1' })
    let next = f.apply({ type: 'insert', table: 'rewards', row: { id: 'rnew' } })
    expect(next.rewards.map((x) => x.id)).toEqual([f.raw.rewards[0].id, 'rnew'])
    next = f.apply({ type: 'insert', table: 'categories', row: { id: 'cnew' } })
    expect(next.categories.map((x) => x.id)).toEqual(['c1', 'cnew'])
    next = f.apply({ type: 'insert', table: 'task_presets', row: { id: 'pnew' } })
    expect(next.presets.map((x) => x.id)).toEqual(['p1', 'pnew'])
    expect(next.tasks).toBe(f.raw.tasks) // 沒動到的表維持同一個參考
  })

  it('會蓋上 created_at / updated_at,但不覆寫 row 自帶的值', () => {
    const f = fixture()
    const next = f.apply({ type: 'insert', table: 'tasks', row: { id: 'x' } })
    expect(typeof next.tasks[0].created_at).toBe('string')
    expect(() => new Date(next.tasks[0].updated_at).toISOString()).not.toThrow()

    const next2 = f.apply({ type: 'insert', table: 'tasks', row: { id: 'y', created_at: '2000-01-01T00:00:00.000Z' } })
    expect(next2.tasks[0].created_at).toBe('2000-01-01T00:00:00.000Z')
  })

  it('未知的資料表原樣回傳', () => {
    const f = fixture()
    f.task()
    const next = f.apply({ type: 'insert', table: 'nope', row: { id: 'x' } })
    expect(next).toBe(f.raw)
  })
})

describe('update / delete', () => {
  it('update 只改符合 id 的那一筆並蓋上 updated_at', () => {
    const f = fixture()
    const t1 = f.task({ title: '甲' })
    const t2 = f.task({ title: '乙' })
    const next = f.apply({ type: 'update', table: 'tasks', id: t1.id, row: { title: '丙' } })
    expect(findTask(next, t1.id).title).toBe('丙')
    expect(typeof findTask(next, t1.id).updated_at).toBe('string')
    expect(findTask(next, t2.id)).toBe(t2)
  })

  it('update 未知資料表原樣回傳', () => {
    const f = fixture()
    expect(f.apply({ type: 'update', table: 'nope', id: 'x', row: {} })).toBe(f.raw)
  })

  it('delete 只移除該 id', () => {
    const f = fixture()
    const t1 = f.task()
    const t2 = f.task()
    const next = f.apply({ type: 'delete', table: 'tasks', id: t1.id })
    expect(next.tasks.map((t) => t.id)).toEqual([t2.id])
    expect(f.apply({ type: 'delete', table: 'nope', id: t1.id })).toBe(f.raw)
  })

  it('未知的 op.type 原樣回傳', () => {
    const f = fixture()
    expect(f.apply({ type: 'weird' })).toBe(f.raw)
  })
})

describe('rpc submit_task', () => {
  it('一般任務:變成待審核、記錄完成者與選項、note 去頭尾空白', () => {
    const f = fixture()
    const t = f.task({ assigned_to: A, note: '舊說明' })
    const next = f.apply(rpc('submit_task', { p_task_id: t.id, p_choice: '選項一', p_note: '  新說明  ' }))
    const nt = findTask(next, t.id)
    expect(nt.status).toBe('submitted')
    expect(nt.completed_by).toBe(A)
    expect(nt.chosen_choice).toBe('選項一')
    expect(nt.note).toBe('新說明')
    expect(next.ledger).toEqual([]) // 一般任務送出不會入帳
  })

  it('note 空白時保留原本的 note;沒有原本 note 則為 null;沒選項為 null', () => {
    const f = fixture()
    const t1 = f.task({ note: '原說明' })
    const t2 = f.task({ note: undefined })
    let next = f.apply(rpc('submit_task', { p_task_id: t1.id, p_note: '   ' }))
    expect(findTask(next, t1.id).note).toBe('原說明')
    next = f.apply(rpc('submit_task', { p_task_id: t2.id }))
    expect(findTask(next, t2.id).note).toBeNull()
    expect(findTask(next, t2.id).chosen_choice).toBeNull()
  })

  it('每日任務(有 recurrence_rule):完成即核准並立刻入帳', () => {
    const f = fixture()
    const t = f.task({ assigned_to: A, reward_points: 7, recurrence_rule: { freq: 'daily', active: true }, reject_reason: '之前退回' })
    const next = f.apply(rpc('submit_task', { p_task_id: t.id }))
    const nt = findTask(next, t.id)
    expect(nt.status).toBe('approved')
    expect(nt.reject_reason).toBeNull()
    expect(nt.completed_by).toBe(A)
    expect(next.ledger).toHaveLength(1)
    expect(next.ledger[0]).toMatchObject({ user_id: A, amount: 7, reason: '任務完成:' + t.title, related_task_id: t.id, _local: true })
  })

  it('每日任務由別人幫忙完成:入帳給完成者且加倍', () => {
    const f = fixture()
    const t = f.task({ assigned_to: B, reward_points: 5, recurrence_rule: { freq: 'daily' } })
    const next = f.apply(rpc('submit_task', { p_task_id: t.id }), { userId: A })
    expect(next.ledger[0]).toMatchObject({ user_id: A, amount: 10 })
    expect(next.ledger[0].reason.startsWith('幫忙完成任務(雙倍):')).toBe(true)
  })

  it('找不到任務原樣回傳', () => {
    const f = fixture()
    expect(f.apply(rpc('submit_task', { p_task_id: 'nope' }))).toBe(f.raw)
  })
})

describe('rpc approve_task', () => {
  it('積分任務:核准後給被指派者 reward_points 積分', () => {
    const f = fixture()
    const t = f.task({ assigned_to: B, completed_by: B, status: 'submitted', reward_points: 12, reject_reason: '舊原因' })
    const next = f.apply(rpc('approve_task', { p_task_id: t.id }))
    expect(findTask(next, t.id)).toMatchObject({ status: 'approved', reject_reason: null })
    expect(next.ledger).toHaveLength(1)
    expect(next.ledger[0]).toMatchObject({ user_id: B, amount: 12, reason: '任務完成:' + t.title, related_task_id: t.id, _local: true })
    expect(typeof next.ledger[0].id).toBe('string')
  })

  it('入帳給完成者;沒有完成者時給被指派者', () => {
    const f = fixture()
    const t = f.task({ assigned_to: B, completed_by: null, status: 'submitted', reward_points: 3 })
    const next = f.apply(rpc('approve_task', { p_task_id: t.id }))
    expect(next.ledger[0].user_id).toBe(B)
  })

  it('幫忙完成(完成者 ≠ 被指派者、非共同任務):積分加倍並標註', () => {
    const f = fixture()
    const t = f.task({ assigned_to: B, completed_by: A, status: 'submitted', reward_points: 4 })
    const next = f.apply(rpc('approve_task', { p_task_id: t.id }), { userId: B })
    expect(next.ledger[0]).toMatchObject({ user_id: A, amount: 8, reason: '幫忙完成任務(雙倍):' + t.title })
  })

  it('共同任務不算幫忙:不加倍', () => {
    const f = fixture()
    const t = f.task({ shared: true, assigned_to: B, completed_by: A, status: 'submitted', reward_points: 4 })
    const next = f.apply(rpc('approve_task', { p_task_id: t.id }))
    expect(next.ledger[0]).toMatchObject({ user_id: A, amount: 4, reason: '任務完成:' + t.title })
  })

  it('獎勵任務:建立一筆待交付兌換(source task、cost 0),不入帳', () => {
    const f = fixture()
    const r = f.reward()
    const t = f.task({ assigned_to: B, completed_by: B, status: 'submitted', reward_type: 'reward', reward_id: r.id, reward_points: 0 })
    const next = f.apply(rpc('approve_task', { p_task_id: t.id }))
    expect(next.ledger).toEqual([])
    expect(next.redemptions).toHaveLength(1)
    expect(next.redemptions[0]).toMatchObject({ reward_id: r.id, requested_by: B, status: 'requested', cost_points: 0, source: 'task', related_task_id: t.id, _local: true })
  })

  it('獎勵任務但沒有 reward_id:只改狀態', () => {
    const f = fixture()
    const t = f.task({ completed_by: A, status: 'submitted', reward_type: 'reward', reward_id: null })
    const next = f.apply(rpc('approve_task', { p_task_id: t.id }))
    expect(findTask(next, t.id).status).toBe('approved')
    expect(next.redemptions).toEqual([])
    expect(next.ledger).toEqual([])
  })

  it('reward_points 為 0 或缺少:不入帳', () => {
    const f = fixture()
    const t1 = f.task({ completed_by: A, status: 'submitted', reward_points: 0 })
    const t2 = f.task({ completed_by: A, status: 'submitted', reward_points: undefined })
    expect(f.apply(rpc('approve_task', { p_task_id: t1.id })).ledger).toEqual([])
    expect(f.apply(rpc('approve_task', { p_task_id: t2.id })).ledger).toEqual([])
  })

  it('沒有完成者也沒有被指派者:只改狀態、不入帳', () => {
    const f = fixture()
    const t = f.task({ assigned_to: null, completed_by: null, status: 'submitted', reward_points: 9 })
    const next = f.apply(rpc('approve_task', { p_task_id: t.id }))
    expect(findTask(next, t.id).status).toBe('approved')
    expect(next.ledger).toEqual([])
  })

  it('找不到任務原樣回傳', () => {
    const f = fixture()
    f.task()
    expect(f.apply(rpc('approve_task', { p_task_id: 'nope' }))).toBe(f.raw)
  })
})

describe('rpc withdraw_task / reject_task / set_task_note', () => {
  it('withdraw_task:回到待完成並清掉完成者與選項', () => {
    const f = fixture()
    const t = f.task({ status: 'submitted', completed_by: A, chosen_choice: 'x' })
    const other = f.task({ status: 'submitted', completed_by: A })
    const next = f.apply(rpc('withdraw_task', { p_task_id: t.id }))
    expect(findTask(next, t.id)).toMatchObject({ status: 'pending', completed_by: null, chosen_choice: null })
    expect(findTask(next, other.id)).toBe(other)
  })

  it('reject_task:狀態退回並記錄原因;空白原因寫「未填寫原因」', () => {
    const f = fixture()
    const t1 = f.task({ status: 'submitted' })
    const t2 = f.task({ status: 'submitted' })
    const t3 = f.task({ status: 'submitted' })
    let next = f.apply(rpc('reject_task', { p_task_id: t1.id, p_reason: '  做得不好  ' }))
    expect(findTask(next, t1.id)).toMatchObject({ status: 'rejected', reject_reason: '做得不好' })
    next = f.apply(rpc('reject_task', { p_task_id: t2.id, p_reason: '   ' }))
    expect(findTask(next, t2.id).reject_reason).toBe('未填寫原因')
    next = f.apply(rpc('reject_task', { p_task_id: t3.id }))
    expect(findTask(next, t3.id).reject_reason).toBe('未填寫原因')
  })

  it('set_task_note:去空白;空白變 null', () => {
    const f = fixture()
    const t = f.task({ note: '舊' })
    let next = f.apply(rpc('set_task_note', { p_task_id: t.id, p_note: ' 新說明 ' }))
    expect(findTask(next, t.id).note).toBe('新說明')
    next = f.apply(rpc('set_task_note', { p_task_id: t.id, p_note: '   ' }))
    expect(findTask(next, t.id).note).toBeNull()
    next = f.apply(rpc('set_task_note', { p_task_id: t.id }))
    expect(findTask(next, t.id).note).toBeNull()
  })
})

describe('rpc stop_recurrence', () => {
  it('同一系列中未完成的期別全部停用;已核准的與其他系列不動', () => {
    const f = fixture()
    const rule = { freq: 'daily', active: true }
    const root = f.task({ status: 'approved', recurrence_rule: rule })
    const pending = f.task({ status: 'pending', parent_task_id: root.id, recurrence_rule: rule })
    const rejected = f.task({ status: 'rejected', parent_task_id: root.id, recurrence_rule: rule })
    const submitted = f.task({ status: 'submitted', parent_task_id: root.id, recurrence_rule: rule })
    const otherSeries = f.task({ status: 'pending', recurrence_rule: rule })
    const oneOff = f.task({ status: 'pending', parent_task_id: root.id, recurrence_rule: null })

    // 從任一期別呼叫,都以 parent_task_id ?? id 找到系列
    const next = f.apply(rpc('stop_recurrence', { p_task_id: rejected.id }))
    expect(findTask(next, root.id).recurrence_rule.active).toBe(true)
    expect(findTask(next, pending.id).recurrence_rule).toEqual({ freq: 'daily', active: false })
    expect(findTask(next, rejected.id).recurrence_rule.active).toBe(false)
    expect(findTask(next, submitted.id).recurrence_rule.active).toBe(false)
    expect(findTask(next, otherSeries.id).recurrence_rule.active).toBe(true)
    expect(findTask(next, oneOff.id)).toBe(oneOff)
  })

  it('從系列根呼叫效果相同', () => {
    const f = fixture()
    const rule = { freq: 'daily', active: true }
    const root = f.task({ status: 'pending', recurrence_rule: rule })
    const child = f.task({ status: 'pending', parent_task_id: root.id, recurrence_rule: rule })
    const next = f.apply(rpc('stop_recurrence', { p_task_id: root.id }))
    expect(findTask(next, root.id).recurrence_rule.active).toBe(false)
    expect(findTask(next, child.id).recurrence_rule.active).toBe(false)
  })

  it('找不到任務原樣回傳', () => {
    const f = fixture()
    expect(f.apply(rpc('stop_recurrence', { p_task_id: 'nope' }))).toBe(f.raw)
  })
})

describe('rpc update_series', () => {
  it('只有系列中 pending / rejected 的期別套用新欄位與規則', () => {
    const f = fixture()
    const oldRule = { freq: 'daily', active: true }
    const newRule = { freq: 'weekly', active: true }
    const root = f.task({ status: 'approved', title: '舊', recurrence_rule: oldRule })
    const pending = f.task({ status: 'pending', title: '舊', parent_task_id: root.id, recurrence_rule: oldRule })
    const rejected = f.task({ status: 'rejected', title: '舊', parent_task_id: root.id, recurrence_rule: oldRule })
    const submitted = f.task({ status: 'submitted', title: '舊', parent_task_id: root.id, recurrence_rule: oldRule })
    const other = f.task({ status: 'pending', title: '舊' })

    const next = f.apply(rpc('update_series', { p_task_id: pending.id, p_fields: { title: '新', reward_points: 99 }, p_rule: newRule }))
    expect(findTask(next, pending.id)).toMatchObject({ title: '新', reward_points: 99, recurrence_rule: newRule })
    expect(typeof findTask(next, pending.id).updated_at).toBe('string')
    expect(findTask(next, rejected.id)).toMatchObject({ title: '新', recurrence_rule: newRule })
    expect(findTask(next, root.id)).toBe(root)
    expect(findTask(next, submitted.id)).toBe(submitted)
    expect(findTask(next, other.id)).toBe(other)
  })

  it('p_fields 缺少時只更新規則', () => {
    const f = fixture()
    const t = f.task({ status: 'pending', recurrence_rule: { freq: 'daily' } })
    const next = f.apply(rpc('update_series', { p_task_id: t.id, p_rule: { freq: 'weekly' } }))
    expect(findTask(next, t.id)).toMatchObject({ title: t.title, recurrence_rule: { freq: 'weekly' } })
  })

  it('找不到任務原樣回傳', () => {
    const f = fixture()
    expect(f.apply(rpc('update_series', { p_task_id: 'nope', p_fields: {}, p_rule: null }))).toBe(f.raw)
  })
})

describe('rpc request_redemption', () => {
  it('依獎勵建立一筆兌換插在最前面', () => {
    const f = fixture()
    const r = f.reward({ cost_points: 30 })
    const existing = f.redemption()
    const next = f.apply(rpc('request_redemption', { p_reward_id: r.id }))
    expect(next.redemptions).toHaveLength(2)
    expect(next.redemptions[0]).toMatchObject({ reward_id: r.id, requested_by: A, status: 'requested', cost_points: 30, source: 'redeem', _local: true })
    expect(typeof next.redemptions[0].id).toBe('string')
    expect(typeof next.redemptions[0].created_at).toBe('string')
    expect(next.redemptions[1]).toBe(existing)
    expect(next.ledger).toEqual([]) // 申請時尚未扣點
  })

  it('找不到獎勵原樣回傳', () => {
    const f = fixture()
    expect(f.apply(rpc('request_redemption', { p_reward_id: 'nope' }))).toBe(f.raw)
  })
})

describe('rpc fulfill_redemption', () => {
  it('交付:狀態 fulfilled、記錄處理者,並扣申請者的點數', () => {
    const f = fixture()
    const r = f.reward({ name: '按摩', cost_points: 40 })
    const d = f.redemption({ reward_id: r.id, requested_by: B, cost_points: 40 })
    const next = f.apply(rpc('fulfill_redemption', { p_redemption_id: d.id }), { userId: A })
    const nd = next.redemptions.find((x) => x.id === d.id)
    expect(nd).toMatchObject({ status: 'fulfilled', handled_by: A })
    expect(typeof nd.fulfilled_at).toBe('string')
    expect(next.ledger).toHaveLength(1)
    expect(next.ledger[0]).toMatchObject({ user_id: B, amount: -40, reason: '兌換獎勵:按摩', related_redemption_id: d.id, _local: true })
  })

  it('獎勵已不存在時原因用預設名稱', () => {
    const f = fixture()
    const d = f.redemption({ reward_id: 'gone', cost_points: 5 })
    const next = f.apply(rpc('fulfill_redemption', { p_redemption_id: d.id }))
    expect(next.ledger[0].reason).toBe('兌換獎勵:獎勵')
  })

  it('cost_points 為 0(任務獎勵)時不寫 ledger', () => {
    const f = fixture()
    const r = f.reward()
    const d = f.redemption({ reward_id: r.id, cost_points: 0, source: 'task' })
    const next = f.apply(rpc('fulfill_redemption', { p_redemption_id: d.id }))
    expect(next.redemptions[0].status).toBe('fulfilled')
    expect(next.ledger).toEqual([])
    expect(next.ledger).toBe(f.raw.ledger)
  })

  it('找不到兌換原樣回傳', () => {
    const f = fixture()
    expect(f.apply(rpc('fulfill_redemption', { p_redemption_id: 'nope' }))).toBe(f.raw)
  })
})

describe('rpc reject_redemption', () => {
  it('拒絕:狀態 rejected、記錄處理者與原因;空白原因為 null', () => {
    const f = fixture()
    const d1 = f.redemption()
    const d2 = f.redemption()
    let next = f.apply(rpc('reject_redemption', { p_redemption_id: d1.id, p_reason: ' 沒庫存 ' }))
    expect(next.redemptions.find((x) => x.id === d1.id)).toMatchObject({ status: 'rejected', handled_by: A, reject_reason: '沒庫存' })
    expect(next.redemptions.find((x) => x.id === d2.id)).toBe(d2)
    next = f.apply(rpc('reject_redemption', { p_redemption_id: d2.id, p_reason: '' }))
    expect(next.redemptions.find((x) => x.id === d2.id).reject_reason).toBeNull()
    expect(next.ledger).toEqual([])
  })
})

describe('其他', () => {
  it('未知的 rpc 原樣回傳', () => {
    const f = fixture()
    f.task()
    expect(f.apply(rpc('no_such_fn', { p_task_id: 't1' }))).toBe(f.raw)
    expect(f.apply({ type: 'rpc', fn: 'no_such_fn' })).toBe(f.raw)
  })

  it('newId 每次都回傳不同字串', () => {
    const ids = new Set(Array.from({ length: 200 }, () => newId()))
    expect(ids.size).toBe(200)
    for (const id of ids) expect(typeof id).toBe('string')
  })
})
