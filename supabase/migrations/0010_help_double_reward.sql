-- ============================================================================
-- 幫對方完成任務:雙倍獎勵
-- 原本一般任務只有被指派者能標記完成;現在任何一方都可以完成任何任務
-- (等於「幫對方做」)。若完成者不是原本的被指派者,積分獎勵加倍發放
-- (指定獎勵型無法加倍,仍發一份)。
-- 審核者統一改為「完成者以外的那個人」,不再區分共同 / 一般任務。
-- ============================================================================

-- 誰可以審核:完成者以外的那個人(共同任務、一般任務、被別人幫忙完成的任務都適用)
create or replace function public.can_review(t public.tasks)
returns boolean language sql stable as $$
  select t.completed_by is not null and t.completed_by <> auth.uid() and public.is_member();
$$;

-- 標記完成:任何一方都可以完成任何任務(不限被指派者),等於可以幫對方做
create or replace function public.submit_task(p_task_id uuid, p_choice text default null)
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
  update public.tasks set status = 'submitted', completed_by = auth.uid(), chosen_choice = p_choice where id = p_task_id;
end $$;

-- 核准:完成者不是原本的被指派者(等於幫忙做)時,積分獎勵加倍
create or replace function public.approve_task(p_task_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  t          public.tasks%rowtype;
  rule       jsonb;
  recipient  uuid;
  helped     boolean;
  points     int;
begin
  perform public.assert_member();
  select * into t from public.tasks where id = p_task_id for update;
  if not found then raise exception '任務不存在'; end if;
  if not public.can_review(t) then raise exception '你不能審核這筆任務'; end if;
  if t.status <> 'submitted' then raise exception '任務不在待審核狀態'; end if;

  recipient := coalesce(t.completed_by, t.assigned_to);
  helped := (not t.shared) and t.assigned_to is not null and t.completed_by is not null and t.completed_by <> t.assigned_to;
  update public.tasks set status = 'approved', reject_reason = null where id = p_task_id;

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
