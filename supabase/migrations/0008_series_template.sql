-- ============================================================================
-- 週期任務的「系列範本」
-- recurrence_rule.template 存放系列的預設內容(標題、說明、圖片、類別、優先程度、獎勵)。
-- 產生下一期時一律照範本,所以單獨修改某一期(例如今天改成「練吉他」)不會影響之後的期別。
-- 沒有 template 的舊資料則沿用該期的內容。
-- ============================================================================

-- 依範本(或該期內容)產生新的一期
create or replace function public.spawn_next_period(t public.tasks, p_due date, p_root uuid)
returns void language plpgsql security definer set search_path = public as $$
declare tpl jsonb := coalesce(t.recurrence_rule->'template', '{}'::jsonb);
begin
  insert into public.tasks (
    title, description, image_urls, category_id, created_by, assigned_to, shared, priority,
    reward_type, reward_points, reward_id, status, due_date, recurrence_rule, parent_task_id
  ) values (
    coalesce(tpl->>'title', t.title),
    coalesce(tpl->>'description', t.description),
    case when tpl ? 'image_urls' then array(select jsonb_array_elements_text(tpl->'image_urls')) else t.image_urls end,
    case when tpl ? 'category_id' then nullif(tpl->>'category_id', '')::uuid else t.category_id end,
    t.created_by, t.assigned_to, t.shared,
    coalesce((tpl->>'priority')::smallint, t.priority),
    coalesce(tpl->>'reward_type', t.reward_type),
    coalesce((tpl->>'reward_points')::int, t.reward_points),
    case when tpl ? 'reward_id' then nullif(tpl->>'reward_id', '')::uuid else t.reward_id end,
    'pending', p_due, t.recurrence_rule, p_root
  );
end $$;

create or replace function public.approve_task(p_task_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  t          public.tasks%rowtype;
  rule       jsonb;
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
    -- 若這個系列已經有進行中的期別(例如過期即丟已補上今天),就不重複產生
    if not exists (
      select 1 from public.tasks x
      where coalesce(x.parent_task_id, x.id) = coalesce(t.parent_task_id, t.id)
        and x.id <> t.id and x.status in ('pending', 'rejected', 'submitted')
    ) then
      perform public.spawn_next_period(t, public.next_due_date(rule, t.due_date), coalesce(t.parent_task_id, t.id));
    end if;
  end if;
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
      where coalesce(x.parent_task_id, x.id) = root and x.status in ('pending', 'rejected', 'submitted')
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

-- 停用重複:整個系列所有進行中的期別一起停用
create or replace function public.stop_recurrence(p_task_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t public.tasks%rowtype; root uuid;
begin
  perform public.assert_member();
  select * into t from public.tasks where id = p_task_id for update;
  if not found then raise exception '任務不存在'; end if;
  if t.created_by <> auth.uid() then raise exception '只有建立者可以停用重複'; end if;
  if t.recurrence_rule is null then return; end if;
  root := coalesce(t.parent_task_id, t.id);
  update public.tasks
     set recurrence_rule = recurrence_rule || jsonb_build_object('active', false)
   where recurrence_rule is not null
     and coalesce(parent_task_id, id) = root
     and status in ('pending', 'rejected', 'submitted');
end $$;

-- 編輯整個系列:更新所有進行中期別的內容、規則與範本(只有建立者)
create or replace function public.update_series(p_task_id uuid, p_fields jsonb, p_rule jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare t public.tasks%rowtype; root uuid; n int;
begin
  perform public.assert_member();
  select * into t from public.tasks where id = p_task_id;
  if not found then raise exception '任務不存在'; end if;
  if t.created_by <> auth.uid() then raise exception '只有建立者可以編輯系列'; end if;
  root := coalesce(t.parent_task_id, t.id);
  update public.tasks set
    title         = coalesce(p_fields->>'title', title),
    description   = coalesce(p_fields->>'description', description),
    image_urls    = case when p_fields ? 'image_urls' then array(select jsonb_array_elements_text(p_fields->'image_urls')) else image_urls end,
    category_id   = case when p_fields ? 'category_id' then nullif(p_fields->>'category_id', '')::uuid else category_id end,
    priority      = coalesce((p_fields->>'priority')::smallint, priority),
    assigned_to   = case when p_fields ? 'assigned_to' then nullif(p_fields->>'assigned_to', '')::uuid else assigned_to end,
    shared        = coalesce((p_fields->>'shared')::boolean, shared),
    reward_type   = coalesce(p_fields->>'reward_type', reward_type),
    reward_points = coalesce((p_fields->>'reward_points')::int, reward_points),
    reward_id     = case when p_fields ? 'reward_id' then nullif(p_fields->>'reward_id', '')::uuid else reward_id end,
    recurrence_rule = p_rule
  where coalesce(parent_task_id, id) = root
    and status in ('pending', 'rejected');
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function public.update_series(uuid, jsonb, jsonb), public.spawn_next_period(public.tasks, date, uuid) from public, anon;
grant execute on function public.update_series(uuid, jsonb, jsonb) to authenticated;
