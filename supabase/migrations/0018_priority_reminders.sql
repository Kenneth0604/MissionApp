-- ============================================================================
-- 優先程度提醒:緊急(5)每天、有點急(4)每兩天,對還沒完成的一般任務推播提醒。
-- 每天台灣時間 09:00(UTC 01:00)由 pg_cron 執行,透過 pg_net 呼叫 Edge Function push-notify
--(payload type = 'REMINDER')。
--
-- 執行前把 PROJECT_REF 與 WEBHOOK_SECRET 換成實際值(同 0002)。
-- ============================================================================

alter table public.tasks add column if not exists last_reminded_at timestamptz;

-- 推播端點設定(只有 security definer 函式會讀;不開任何 policy)
create table if not exists public.app_config (
  key    text primary key,
  value  text not null
);
alter table public.app_config enable row level security;
revoke all on public.app_config from anon, authenticated;
insert into public.app_config (key, value) values
  ('push_url', 'https://PROJECT_REF.supabase.co/functions/v1/push-notify'),
  ('webhook_secret', 'WEBHOOK_SECRET')
on conflict (key) do update set value = excluded.value;

create or replace function public.send_priority_reminders()
returns int language plpgsql security definer set search_path = public as $$
declare
  t        public.tasks%rowtype;
  v_url    text;
  v_secret text;
  sent     int := 0;
begin
  select value into v_url from public.app_config where key = 'push_url';
  select value into v_secret from public.app_config where key = 'webhook_secret';
  if v_url is null then return 0; end if;

  for t in
    select * from public.tasks
    where recurrence_rule is null
      and status in ('pending', 'rejected')
      and priority >= 4
      and coalesce(last_reminded_at, created_at) <= now() - (case when priority = 5 then interval '1 day' else interval '2 days' end)
    order by priority desc, due_date nulls last
  loop
    perform net.http_post(
      url                  := v_url,
      headers              := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', coalesce(v_secret, '')),
      body                 := jsonb_build_object('type', 'REMINDER', 'table', 'tasks', 'schema', 'public', 'record', to_jsonb(t), 'old_record', null),
      timeout_milliseconds := 5000
    );
    update public.tasks set last_reminded_at = now() where id = t.id;
    sent := sent + 1;
  end loop;
  return sent;
end $$;
revoke execute on function public.send_priority_reminders() from public, anon, authenticated;

-- 每天台灣時間 09:00
select cron.schedule('missionapp-reminders', '0 1 * * *', $$select public.send_priority_reminders()$$);
