-- ============================================================================
-- 週期性任務「過期即丟」
-- recurrence_rule 多一個 expire_on_miss: true。
-- 每天台灣時間凌晨 3 點(= 一天的界線)結算:到期日已過且尚未完成的期別標記為 expired
-- (前端不顯示),並立刻產生新的一期;有完成的照常在核准時產生下一期。
-- ============================================================================

-- 「今天」的定義:台灣時間減 3 小時後的日期(凌晨 3 點前仍算前一天)
create or replace function public.app_today()
returns date language sql stable as $$
  select ((now() at time zone 'Asia/Taipei') - interval '3 hours')::date;
$$;

-- 狀態多一個 expired
alter table public.tasks drop constraint if exists tasks_status_check;
alter table public.tasks add constraint tasks_status_check
  check (status in ('pending', 'submitted', 'approved', 'rejected', 'expired'));

-- 下一期到期日改以 app_today() 為基準
create or replace function public.next_due_date(rule jsonb, from_date date)
returns date language plpgsql stable as $$
declare
  freq  text := rule->>'freq';
  base  date := greatest(coalesce(from_date, public.app_today()), public.app_today());
  dow   int;
  diff  int;
begin
  if freq = 'daily' then
    return base + 1;
  elsif freq = 'weekly' then
    dow  := coalesce((rule->>'day_of_week')::int, extract(dow from base)::int);
    diff := ((dow - extract(dow from base)::int) % 7 + 7) % 7;
    if diff = 0 then diff := 7; end if;
    return base + diff;
  end if;
  return null;
end $$;

-- 結算:把錯過的期別標記 expired,並為該規則補上新的一期(若目前沒有進行中的期別)
create or replace function public.rollover_recurring_tasks()
returns int language plpgsql security definer set search_path = public as $$
declare
  t         public.tasks%rowtype;
  today     date := public.app_today();
  root      uuid;
  has_open  boolean;
  next_due  date;
  created   int := 0;
begin
  for t in
    select * from public.tasks
    where recurrence_rule is not null
      and coalesce((recurrence_rule->>'active')::boolean, true)
      and coalesce((recurrence_rule->>'expire_on_miss')::boolean, false)
      and status in ('pending', 'rejected')
      and due_date is not null
      and due_date < today
    order by due_date
  loop
    root := coalesce(t.parent_task_id, t.id);
    update public.tasks set status = 'expired' where id = t.id;

    select exists (
      select 1 from public.tasks x
      where coalesce(x.parent_task_id, x.id) = root
        and x.status in ('pending', 'rejected', 'submitted')
    ) into has_open;

    if not has_open then
      next_due := case
        when t.recurrence_rule->>'freq' = 'daily' then today
        else public.next_due_date(t.recurrence_rule, today - 1)   -- 今天若剛好是指定星期就用今天
      end;
      insert into public.tasks (
        title, description, image_urls, category_id, created_by, assigned_to, shared, priority,
        reward_type, reward_points, reward_id, status, due_date, recurrence_rule, parent_task_id
      ) values (
        t.title, t.description, t.image_urls, t.category_id, t.created_by, t.assigned_to, t.shared, t.priority,
        t.reward_type, t.reward_points, t.reward_id, 'pending', next_due, t.recurrence_rule, root
      );
      created := created + 1;
    end if;
  end loop;
  return created;
end $$;

revoke execute on function public.rollover_recurring_tasks() from public, anon;
grant execute on function public.rollover_recurring_tasks() to authenticated;

-- 每天台灣時間 03:00(= UTC 19:00)由 pg_cron 執行;App 開啟時也會呼叫一次作為備援
create extension if not exists pg_cron;
select cron.schedule('missionapp-rollover', '0 19 * * *', $$select public.rollover_recurring_tasks()$$);
