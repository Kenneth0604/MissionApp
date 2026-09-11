-- ============================================================================
-- 每日任務改回需要審核(完成 → 待審核 → 對方核准),但換日(凌晨 3 點)時:
--   - 待審核的期別留著等審核,不會被丟掉
--   - 只要沒有「待完成 / 已退回」的期別,就先產生新的一期
--   - 過期即丟的任務:待完成 / 已退回且過期的期別標記 expired
-- ============================================================================

create or replace function public.submit_task(p_task_id uuid, p_choice text default null, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare t public.tasks%rowtype;
begin
  perform public.assert_member();
  select * into t from public.tasks where id = p_task_id for update;
  if not found then raise exception '任務不存在'; end if;
  if t.status not in ('pending', 'rejected') then raise exception '任務目前不能標記完成'; end if;
  if t.choices is not null and array_length(t.choices, 1) > 0 then
    if p_choice is null or not (p_choice = any(t.choices)) then
      raise exception '請選擇一個選項';
    end if;
  else
    p_choice := null;
  end if;
  update public.tasks
     set status = 'submitted', completed_by = auth.uid(), chosen_choice = p_choice,
         note = coalesce(nullif(trim(p_note), ''), note)
   where id = p_task_id;
end $$;

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
      and status in ('pending', 'rejected', 'submitted')
      and due_date is not null
      and due_date < today
    order by due_date
  loop
    root := coalesce(t.parent_task_id, t.id);

    if t.status in ('pending', 'rejected') then
      -- 沒完成的期別:過期即丟 → 標記 expired 並補新的一期;否則留著,不產生新的
      if coalesce((t.recurrence_rule->>'expire_on_miss')::boolean, false) then
        update public.tasks set status = 'expired' where id = t.id;
      else
        continue;
      end if;
    end if;
    -- 走到這裡:t 是「待審核」或剛被丟掉的期別 → 沒有待完成的期別就先給新的一期

    select exists (
      select 1 from public.tasks x
      where coalesce(x.parent_task_id, x.id) = root and x.status in ('pending', 'rejected')
    ) into has_open;

    if not has_open then
      next_due := case
        when t.recurrence_rule->>'freq' = 'daily' then today
        else public.next_due_date(t.recurrence_rule, today - 1)
      end;
      perform public.spawn_next_period(t, next_due, root);
      created := created + 1;
    end if;
  end loop;
  return created;
end $$;
