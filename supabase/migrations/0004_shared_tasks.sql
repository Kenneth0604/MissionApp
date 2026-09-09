-- ============================================================================
-- 共同任務:指派給「兩人共同」,誰先完成就由另一人審核,獎勵發給完成者。
-- 獎勵類型新增 'none'(無獎勵)。
-- ============================================================================

alter table public.tasks alter column assigned_to drop not null;
alter table public.tasks add column if not exists shared boolean not null default false;
alter table public.tasks add column if not exists completed_by uuid references public.users(id) on delete set null;

alter table public.tasks drop constraint if exists tasks_reward_type_check;
alter table public.tasks add constraint tasks_reward_type_check check (reward_type in ('points', 'reward', 'none'));

-- 新增任務:共同任務 assigned_to 為 null;一般任務必須指向 A / B
drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks for insert to authenticated
  with check (
    public.is_member() and created_by = auth.uid() and status = 'pending'
    and ((shared and assigned_to is null) or exists (select 1 from public.users where id = assigned_to))
  );

-- 誰可以審核這筆任務?共同任務:非完成者;一般任務:建立者
create or replace function public.can_review(t public.tasks)
returns boolean language sql stable as $$
  select case
    when t.shared then t.completed_by is not null and t.completed_by <> auth.uid() and public.is_member()
    else t.created_by = auth.uid()
  end;
$$;

create or replace function public.submit_task(p_task_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t public.tasks%rowtype;
begin
  perform public.assert_member();
  select * into t from public.tasks where id = p_task_id for update;
  if not found then raise exception '任務不存在'; end if;
  if not t.shared and t.assigned_to <> auth.uid() then raise exception '只有被指派者可以標記完成'; end if;
  if t.status not in ('pending', 'rejected') then raise exception '任務目前不能標記完成'; end if;
  update public.tasks set status = 'submitted', completed_by = auth.uid() where id = p_task_id;
end $$;

create or replace function public.reject_task(p_task_id uuid, p_reason text default '')
returns void language plpgsql security definer set search_path = public as $$
declare t public.tasks%rowtype;
begin
  perform public.assert_member();
  select * into t from public.tasks where id = p_task_id for update;
  if not found then raise exception '任務不存在'; end if;
  if not public.can_review(t) then raise exception '你不能審核這筆任務'; end if;
  if t.status <> 'submitted' then raise exception '任務不在待審核狀態'; end if;
  update public.tasks
     set status = 'rejected',
         reject_reason = coalesce(nullif(trim(p_reason), ''), '未填寫原因')
   where id = p_task_id;
end $$;

create or replace function public.approve_task(p_task_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  t          public.tasks%rowtype;
  rule       jsonb;
  next_due   date;
  recipient  uuid;
begin
  perform public.assert_member();
  select * into t from public.tasks where id = p_task_id for update;
  if not found then raise exception '任務不存在'; end if;
  if not public.can_review(t) then raise exception '你不能審核這筆任務'; end if;
  if t.status <> 'submitted' then raise exception '任務不在待審核狀態'; end if;

  recipient := coalesce(t.completed_by, t.assigned_to);
  update public.tasks set status = 'approved', reject_reason = null where id = p_task_id;

  -- 發放獎勵給完成者
  if t.reward_type = 'points' then
    if t.reward_points > 0 and recipient is not null then
      insert into public.points_ledger (user_id, amount, reason, related_task_id)
      values (recipient, t.reward_points, '任務完成:' || t.title, t.id);
    end if;
  elsif t.reward_type = 'reward' and t.reward_id is not null and recipient is not null then
    insert into public.redemptions (reward_id, requested_by, status, cost_points, source, related_task_id)
    values (t.reward_id, recipient, 'requested', 0, 'task', t.id);
  end if;
  -- 'none':無獎勵

  -- 重複任務:核准後才產生下一期
  rule := t.recurrence_rule;
  if rule is not null and coalesce((rule->>'active')::boolean, true) then
    next_due := public.next_due_date(rule, t.due_date);
    insert into public.tasks (
      title, description, image_urls, category_id, created_by, assigned_to, shared,
      reward_type, reward_points, reward_id, status, due_date, recurrence_rule, parent_task_id
    ) values (
      t.title, t.description, t.image_urls, t.category_id, t.created_by, t.assigned_to, t.shared,
      t.reward_type, t.reward_points, t.reward_id, 'pending', next_due, rule, coalesce(t.parent_task_id, t.id)
    );
  end if;
end $$;

grant execute on function public.can_review(public.tasks) to authenticated;
