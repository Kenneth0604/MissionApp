-- ============================================================================
-- 每日任務:每一期可以寫當天的說明(note);完成時不需審核,直接核准並發獎勵、產生下一期。
-- ============================================================================

alter table public.tasks add column if not exists note text;

-- 核准後的共同流程:發獎勵(幫忙完成 → 積分加倍)、產生下一期
create or replace function public.finalize_approval(t public.tasks)
returns void language plpgsql security definer set search_path = public as $$
declare
  rule       jsonb;
  recipient  uuid;
  helped     boolean;
  points     int;
begin
  recipient := coalesce(t.completed_by, t.assigned_to);
  helped := (not t.shared) and t.assigned_to is not null and t.completed_by is not null and t.completed_by <> t.assigned_to;

  if t.reward_type = 'points' then
    points := t.reward_points * (case when helped then 2 else 1 end);
    if points > 0 and recipient is not null then
      insert into public.points_ledger (user_id, amount, reason, related_task_id)
      values (recipient, points, (case when helped then '幫忙完成任務(雙倍):' else '任務完成:' end) || t.title, t.id);
    end if;
  elsif t.reward_type = 'reward' and t.reward_id is not null and recipient is not null then
    insert into public.redemptions (reward_id, requested_by, status, cost_points, source, related_task_id)
    values (t.reward_id, recipient, 'requested', 0, 'task', t.id);
  end if;

  rule := t.recurrence_rule;
  if rule is not null and coalesce((rule->>'active')::boolean, true) then
    if not exists (
      select 1 from public.tasks x
      where coalesce(x.parent_task_id, x.id) = coalesce(t.parent_task_id, t.id)
        and x.id <> t.id and x.status in ('pending', 'rejected', 'submitted')
    ) then
      perform public.spawn_next_period(t, public.next_due_date(rule, t.due_date), coalesce(t.parent_task_id, t.id));
    end if;
  end if;
end $$;

create or replace function public.approve_task(p_task_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t public.tasks%rowtype;
begin
  perform public.assert_member();
  select * into t from public.tasks where id = p_task_id for update;
  if not found then raise exception '任務不存在'; end if;
  if not public.can_review(t) then raise exception '你不能審核這筆任務'; end if;
  if t.status <> 'submitted' then raise exception '任務不在待審核狀態'; end if;
  update public.tasks set status = 'approved', reject_reason = null where id = p_task_id;
  perform public.finalize_approval(t);
end $$;

-- 標記完成:可附當天說明;每日任務(有重複規則)直接核准,不需審核
drop function if exists public.submit_task(uuid, text);
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

  if t.recurrence_rule is not null then
    update public.tasks
       set status = 'approved', completed_by = auth.uid(), chosen_choice = p_choice,
           note = coalesce(nullif(trim(p_note), ''), note), reject_reason = null
     where id = p_task_id
     returning * into t;
    perform public.finalize_approval(t);
  else
    update public.tasks
       set status = 'submitted', completed_by = auth.uid(), chosen_choice = p_choice,
           note = coalesce(nullif(trim(p_note), ''), note)
     where id = p_task_id;
  end if;
end $$;
grant execute on function public.submit_task(uuid, text, text) to authenticated;

-- 修改說明(任一方、任何狀態都可以)
create or replace function public.set_task_note(p_task_id uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_member();
  update public.tasks set note = nullif(trim(coalesce(p_note, '')), '') where id = p_task_id;
  if not found then raise exception '任務不存在'; end if;
end $$;
revoke execute on function public.set_task_note(uuid, text), public.finalize_approval(public.tasks) from public, anon;
grant execute on function public.set_task_note(uuid, text) to authenticated;
