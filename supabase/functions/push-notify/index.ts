// MissionApp — Web Push 推播 Edge Function
// 由 Database Webhook(tasks / redemptions 的 INSERT / UPDATE)觸發。
//
// 需要的 secrets(supabase secrets set KEY=VALUE):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT(mailto:you@example.com)
//   WEBHOOK_SECRET(與 0002_push_webhooks.sql 內的 x-webhook-secret 相同)
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 由平台自動注入。
//
// 部署:supabase functions deploy push-notify --no-verify-jwt

import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2'

type Row = Record<string, any>
interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE'
  table: string
  schema: string
  record: Row | null
  old_record: Row | null
}
interface Notice {
  to: string // user id
  title: string
  body: string
  url: string
  tag?: string
}

const APP_BASE = '/MissionApp/#'

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
)

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })

  const secret = Deno.env.get('WEBHOOK_SECRET')
  if (secret && req.headers.get('x-webhook-secret') !== secret) {
    return new Response('unauthorized', { status: 401 })
  }

  let payload: WebhookPayload
  try {
    payload = await req.json()
  } catch {
    return new Response('bad request', { status: 400 })
  }

  const notices = await buildNotices(payload)
  if (notices.length === 0) return json({ sent: 0, reason: 'no-op' })

  let sent = 0
  const stale: string[] = []

  for (const n of notices) {
    const { data: subs } = await supabase.from('push_subscriptions').select('endpoint, subscription').eq('user_id', n.to)
    for (const s of subs ?? []) {
      try {
        await webpush.sendNotification(s.subscription, JSON.stringify({ title: n.title, body: n.body, url: n.url, tag: n.tag }), {
          TTL: 60 * 60 * 24,
        })
        sent++
      } catch (err: any) {
        const code = err?.statusCode
        if (code === 404 || code === 410) stale.push(s.endpoint)
        else console.error('push failed', code, err?.body ?? err?.message)
      }
    }
  }

  if (stale.length) await supabase.from('push_subscriptions').delete().in('endpoint', stale)

  return json({ sent, removed: stale.length })
})

async function buildNotices(p: WebhookPayload): Promise<Notice[]> {
  const rec = p.record
  if (!rec) return []
  const users = await loadUsers()
  const name = (id: string) => users[id] ?? '對方'

  if (p.table === 'tasks') {
    const url = `${APP_BASE}/tasks/${rec.id}`
    const tag = `task-${rec.id}`

    const others = Object.keys(users).filter((id) => id !== rec.created_by)
    // 完成者(共同任務用 completed_by;一般任務就是被指派者)
    const doer = rec.completed_by ?? rec.assigned_to
    // 審核者:共同任務 = 非完成者;一般任務 = 建立者
    const reviewers = rec.shared ? Object.keys(users).filter((id) => id !== doer) : [rec.created_by]

    if (p.type === 'INSERT') {
      if (rec.shared) return others.map((to) => ({ to, title: '📌 新共同任務', body: `${name(rec.created_by)} 新增:${rec.title}(誰先完成誰拿獎勵)`, url, tag }))
      if (rec.assigned_to === rec.created_by) return []
      return [{ to: rec.assigned_to, title: '📌 新任務', body: `${name(rec.created_by)} 派給你:${rec.title}`, url, tag }]
    }

    if (p.type === 'UPDATE' && p.old_record && p.old_record.status !== rec.status) {
      switch (rec.status) {
        case 'submitted':
          return reviewers.filter((to) => to && to !== doer).map((to) => ({ to, title: '⏳ 任務待審核', body: `${name(doer)} 完成了「${rec.title}」,請審核`, url, tag }))
        case 'approved': {
          const reward =
            rec.reward_type === 'reward' ? '獎勵已列入待交付' : rec.reward_type === 'points' && rec.reward_points > 0 ? `+${rec.reward_points} 積分` : '已核准'
          return doer ? [{ to: doer, title: '✅ 任務已核准', body: `「${rec.title}」${reward}`, url, tag }] : []
        }
        case 'rejected':
          return doer ? [{ to: doer, title: '↩️ 任務被退回', body: `「${rec.title}」:${rec.reject_reason ?? '請重新處理'}`, url, tag }] : []
      }
    }
    return []
  }

  if (p.table === 'redemptions') {
    const rewardName = await loadRewardName(rec.reward_id)
    const url = `${APP_BASE}/redemptions`
    const tag = `redemption-${rec.id}`
    const others = Object.keys(users).filter((id) => id !== rec.requested_by)

    if (p.type === 'INSERT') {
      const body =
        rec.source === 'task'
          ? `${name(rec.requested_by)} 完成任務獲得「${rewardName}」,待你交付`
          : `${name(rec.requested_by)} 想兌換「${rewardName}」(${rec.cost_points} 點)`
      return others.map((to) => ({ to, title: '🎁 兌換申請', body, url, tag }))
    }

    if (p.type === 'UPDATE' && p.old_record && p.old_record.status !== rec.status) {
      if (rec.status === 'fulfilled') {
        return [{ to: rec.requested_by, title: '🎉 獎勵已交付', body: `「${rewardName}」已由 ${name(rec.handled_by)} 交付`, url, tag }]
      }
      if (rec.status === 'rejected') {
        return [{ to: rec.requested_by, title: '❌ 兌換被拒絕', body: `「${rewardName}」${rec.reject_reason ? `:${rec.reject_reason}` : ''}`, url, tag }]
      }
    }
  }

  return []
}

async function loadUsers(): Promise<Record<string, string>> {
  const { data } = await supabase.from('users').select('id, code, name')
  return Object.fromEntries((data ?? []).map((u) => [u.id, u.name || u.code]))
}

async function loadRewardName(id: string | null): Promise<string> {
  if (!id) return '獎勵'
  const { data } = await supabase.from('rewards').select('name').eq('id', id).maybeSingle()
  return data?.name ?? '獎勵'
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
