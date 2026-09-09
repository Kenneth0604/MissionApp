-- ============================================================================
-- MissionApp — 推播 Webhook(以 pg_net 直接呼叫 Edge Function)
-- tasks / redemptions 有異動時,呼叫 Edge Function `push-notify` 發送 Web Push。
--
-- 執行前先把下方兩個佔位符換掉(共出現 2 次):
--   PROJECT_REF     → Supabase 專案 ref(Dashboard 網址 https://supabase.com/dashboard/project/<PROJECT_REF>)
--   WEBHOOK_SECRET  → 與 `supabase secrets set WEBHOOK_SECRET=...` 相同的字串
--
-- 這份 SQL 不需要先在 Dashboard 建立 Database Webhook。
-- ============================================================================

create extension if not exists pg_net;

-- 觸發器函式:把異動包成與 Supabase Database Webhook 相同格式的 JSON 送出
create or replace function public.notify_push_webhook()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url     text := tg_argv[0];
  v_secret  text := tg_argv[1];
begin
  perform net.http_post(
    url                  := v_url,
    headers              := jsonb_build_object(
                              'Content-Type', 'application/json',
                              'x-webhook-secret', v_secret
                            ),
    body                 := jsonb_build_object(
                              'type',       tg_op,
                              'table',      tg_table_name,
                              'schema',     tg_table_schema,
                              'record',     to_jsonb(new),
                              'old_record', case when tg_op = 'UPDATE' then to_jsonb(old) else null end
                            ),
    timeout_milliseconds := 5000
  );
  return new;
end $$;

drop trigger if exists tasks_push_webhook on public.tasks;
create trigger tasks_push_webhook
  after insert or update of status on public.tasks
  for each row
  execute function public.notify_push_webhook(
    'https://PROJECT_REF.supabase.co/functions/v1/push-notify',
    'WEBHOOK_SECRET'
  );

drop trigger if exists redemptions_push_webhook on public.redemptions;
create trigger redemptions_push_webhook
  after insert or update of status on public.redemptions
  for each row
  execute function public.notify_push_webhook(
    'https://PROJECT_REF.supabase.co/functions/v1/push-notify',
    'WEBHOOK_SECRET'
  );

-- 檢查:應該列出兩個 trigger
select tgname, tgrelid::regclass as table_name
from pg_trigger
where tgname in ('tasks_push_webhook', 'redemptions_push_webhook');
