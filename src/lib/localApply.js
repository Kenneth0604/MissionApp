/**
 * 離線優先:把「待同步的操作」先套用到本機資料(樂觀更新)。
 * 這裡只是近似模擬;真正結果以同步完成後重新抓取的資料為準。
 */
const TABLE_KEY = { tasks: 'tasks', rewards: 'rewards', categories: 'categories', task_presets: 'presets', redemptions: 'redemptions' }
const PREPEND = new Set(['tasks', 'redemptions'])

export const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`)

const nowIso = () => new Date().toISOString()
const patchById = (list, id, patch) => list.map((x) => (x.id === id ? { ...x, ...patch, updated_at: nowIso() } : x))
const rootOf = (t) => t.parent_task_id ?? t.id
const isOpen = (t) => t.status === 'pending' || t.status === 'rejected' || t.status === 'submitted'

export function applyLocal(raw, op, ctx) {
  const { userId } = ctx
  if (op.type === 'insert') {
    const key = TABLE_KEY[op.table]
    if (!key) return raw
    const row = { created_at: nowIso(), updated_at: nowIso(), ...op.row }
    return { ...raw, [key]: PREPEND.has(op.table) ? [row, ...raw[key]] : [...raw[key], row] }
  }
  if (op.type === 'update') {
    const key = TABLE_KEY[op.table]
    return key ? { ...raw, [key]: patchById(raw[key], op.id, op.row) } : raw
  }
  if (op.type === 'delete') {
    const key = TABLE_KEY[op.table]
    return key ? { ...raw, [key]: raw[key].filter((x) => x.id !== op.id) } : raw
  }
  if (op.type !== 'rpc') return raw

  const a = op.args ?? {}
  const task = (id) => raw.tasks.find((t) => t.id === id)

  switch (op.fn) {
    case 'submit_task': {
      const t = task(a.p_task_id)
      if (!t) return raw
      const patch = { completed_by: userId, chosen_choice: a.p_choice ?? null, note: a.p_note?.trim() ? a.p_note.trim() : t.note ?? null }
      return { ...raw, tasks: patchById(raw.tasks, t.id, { ...patch, status: 'submitted' }) }
    }
    case 'approve_task': {
      const t = task(a.p_task_id)
      if (!t) return raw
      const next = { ...raw, tasks: patchById(raw.tasks, t.id, { status: 'approved', reject_reason: null }) }
      return grantReward(next, t, ctx)
    }
    case 'withdraw_task':
      return { ...raw, tasks: patchById(raw.tasks, a.p_task_id, { status: 'pending', completed_by: null, chosen_choice: null }) }
    case 'reject_task':
      return { ...raw, tasks: patchById(raw.tasks, a.p_task_id, { status: 'rejected', reject_reason: a.p_reason?.trim() || '未填寫原因' }) }
    case 'set_task_note':
      return { ...raw, tasks: patchById(raw.tasks, a.p_task_id, { note: a.p_note?.trim() || null }) }
    case 'stop_recurrence': {
      const t = task(a.p_task_id)
      if (!t) return raw
      const root = rootOf(t)
      return {
        ...raw,
        tasks: raw.tasks.map((x) =>
          x.recurrence_rule && rootOf(x) === root && isOpen(x) ? { ...x, recurrence_rule: { ...x.recurrence_rule, active: false } } : x,
        ),
      }
    }
    case 'update_series': {
      const t = task(a.p_task_id)
      if (!t) return raw
      const root = rootOf(t)
      const f = a.p_fields ?? {}
      return {
        ...raw,
        tasks: raw.tasks.map((x) =>
          rootOf(x) === root && (x.status === 'pending' || x.status === 'rejected')
            ? { ...x, ...f, recurrence_rule: a.p_rule, updated_at: nowIso() }
            : x,
        ),
      }
    }
    case 'request_redemption': {
      const r = raw.rewards.find((x) => x.id === a.p_reward_id)
      if (!r) return raw
      const d = { id: newId(), reward_id: r.id, requested_by: userId, status: 'requested', cost_points: r.cost_points, source: 'redeem', created_at: nowIso(), _local: true }
      return { ...raw, redemptions: [d, ...raw.redemptions] }
    }
    case 'fulfill_redemption': {
      const d = raw.redemptions.find((x) => x.id === a.p_redemption_id)
      if (!d) return raw
      const r = raw.rewards.find((x) => x.id === d.reward_id)
      let ledger = raw.ledger
      if (d.cost_points > 0) {
        ledger = [{ id: newId(), user_id: d.requested_by, amount: -d.cost_points, reason: '兌換獎勵:' + (r?.name ?? '獎勵'), related_redemption_id: d.id, created_at: nowIso(), _local: true }, ...ledger]
      }
      return { ...raw, ledger, redemptions: patchById(raw.redemptions, d.id, { status: 'fulfilled', fulfilled_at: nowIso(), handled_by: userId }) }
    }
    case 'reject_redemption':
      return { ...raw, redemptions: patchById(raw.redemptions, a.p_redemption_id, { status: 'rejected', handled_by: userId, reject_reason: a.p_reason?.trim() || null }) }
    default:
      return raw
  }
}

/** 核准後的獎勵(本機模擬):積分入帳(幫忙完成加倍)或建立待交付兌換 */
function grantReward(raw, t, _ctx) {
  const recipient = t.completed_by ?? t.assigned_to
  if (!recipient) return raw
  const helped = !t.shared && t.assigned_to && t.completed_by && t.completed_by !== t.assigned_to
  if (t.reward_type === 'points') {
    const amount = (t.reward_points ?? 0) * (helped ? 2 : 1)
    if (amount <= 0) return raw
    const entry = { id: newId(), user_id: recipient, amount, reason: (helped ? '幫忙完成任務(雙倍):' : '任務完成:') + t.title, related_task_id: t.id, created_at: nowIso(), _local: true }
    return { ...raw, ledger: [entry, ...raw.ledger] }
  }
  if (t.reward_type === 'reward' && t.reward_id) {
    const d = { id: newId(), reward_id: t.reward_id, requested_by: recipient, status: 'requested', cost_points: 0, source: 'task', related_task_id: t.id, created_at: nowIso(), _local: true }
    return { ...raw, redemptions: [d, ...raw.redemptions] }
  }
  return raw
}
