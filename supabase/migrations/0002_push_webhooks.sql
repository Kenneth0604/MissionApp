-- ============================================================================
-- MissionApp — 推播 Webhook
-- 讓 tasks / redemptions 的異動觸發 Edge Function `push-notify`。
--
-- 執行前先把下方兩個佔位符換掉:
--   PROJECT_REF     → 你的 Supabase 專案 ref(Dashboard 網址 https://supabase.com/dashboard/project/<PROJECT_REF>)
--   WEBHOOK_SECRET  → 自訂一串亂數,並用 `supabase secrets set WEBHOOK_SECRET=...` 設給 Edge Function
--
-- 也可以改用 Dashboard → Database → Webhooks 用 UI 建立(效果相同),
-- 設定 HTTP Headers: x-webhook-secret = WEBHOOK_SECRET
-- ============================================================================

create extension if not exists pg_net;

drop trigger if exists tasks_push_webhook on public.tasks;
create trigger tasks_push_webhook
  after insert or update of status on public.tasks
  for each row
  execute function supabase_functions.http_request(
    'https://PROJECT_REF.supabase.co/functions/v1/push-notify',
    'POST',
    '{"Content-Type":"application/json","x-webhook-secret":"WEBHOOK_SECRET"}',
    '{}',
    '5000'
  );

drop trigger if exists redemptions_push_webhook on public.redemptions;
create trigger redemptions_push_webhook
  after insert or update of status on public.redemptions
  for each row
  execute function supabase_functions.http_request(
    'https://PROJECT_REF.supabase.co/functions/v1/push-notify',
    'POST',
    '{"Content-Type":"application/json","x-webhook-secret":"WEBHOOK_SECRET"}',
    '{}',
    '5000'
  );
