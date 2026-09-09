-- 任務優先程度:5 緊急、4 有點急、3 普通(預設)、2 有空就做、1 完全隨便
alter table public.tasks
  add column if not exists priority smallint not null default 3 check (priority between 1 and 5);

-- 重複任務產生下一期時要帶上優先程度(重新定義 approve_task)
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

  if t.reward_type = 'points' then
    if t.reward_points > 0 and recipient is not null then
      insert into public.points_ledger (user_id, amount, reason, related_task_id)
      values (recipient, t.reward_points, '任務完成:' || t.title, t.id);
    end if;
  elsif t.reward_type = 'reward' and t.reward_id is not null and recipient is not null then
    insert into public.redemptions (reward_id, requested_by, status, cost_points, source, related_task_id)
    values (t.reward_id, recipient, 'requested', 0, 'task', t.id);
  end if;

  rule := t.recurrence_rule;
  if rule is not null and coalesce((rule->>'active')::boolean, true) then
    next_due := public.next_due_date(rule, t.due_date);
    insert into public.tasks (
      title, description, image_urls, category_id, created_by, assigned_to, shared, priority,
      reward_type, reward_points, reward_id, status, due_date, recurrence_rule, parent_task_id
    ) values (
      t.title, t.description, t.image_urls, t.category_id, t.created_by, t.assigned_to, t.shared, t.priority,
      t.reward_type, t.reward_points, t.reward_id, 'pending', next_due, rule, coalesce(t.parent_task_id, t.id)
    );
  end if;
end $$;
