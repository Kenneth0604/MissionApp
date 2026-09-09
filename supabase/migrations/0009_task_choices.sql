-- ============================================================================
-- 週期任務的「多選項」
-- 例如每天的任務可以設「看書」「運動」兩個選項,標記完成時選一個做了的;
-- 選項清單存在 tasks.choices(以及系列範本 recurrence_rule.template.choices),
-- 完成時選的那一個存在 tasks.chosen_choice。
-- ============================================================================

alter table public.tasks add column if not exists choices text[];
alter table public.tasks add column if not exists chosen_choice text;

-- submit_task 多一個 p_choice 參數;若任務有 choices,必須從其中選一個才能標記完成
drop function if exists public.submit_task(uuid);
create or replace function public.submit_task(p_task_id uuid, p_choice text default null)
returns void language plpgsql security definer set search_path = public as $$
declare t public.tasks%rowtype;
begin
  perform public.assert_member();
  select * into t from public.tasks where id = p_task_id for update;
  if not found then raise exception '任務不存在'; end if;
  if not t.shared and t.assigned_to <> auth.uid() then raise exception '只有被指派者可以標記完成'; end if;
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
grant execute on function public.submit_task(uuid, text) to authenticated;

-- 產生下一期:choices 一併照範本帶入(新的一期尚未完成,chosen_choice 保持空白)
create or replace function public.spawn_next_period(t public.tasks, p_due date, p_root uuid)
returns void language plpgsql security definer set search_path = public as $$
declare tpl jsonb := coalesce(t.recurrence_rule->'template', '{}'::jsonb);
begin
  insert into public.tasks (
    title, description, image_urls, category_id, created_by, assigned_to, shared, priority, choices,
    reward_type, reward_points, reward_id, status, due_date, recurrence_rule, parent_task_id
  ) values (
    coalesce(tpl->>'title', t.title),
    coalesce(tpl->>'description', t.description),
    case when tpl ? 'image_urls' then array(select jsonb_array_elements_text(tpl->'image_urls')) else t.image_urls end,
    case when tpl ? 'category_id' then nullif(tpl->>'category_id', '')::uuid else t.category_id end,
    t.created_by, t.assigned_to, t.shared,
    coalesce((tpl->>'priority')::smallint, t.priority),
    case when tpl ? 'choices' then array(select jsonb_array_elements_text(tpl->'choices')) else t.choices end,
    coalesce(tpl->>'reward_type', t.reward_type),
    coalesce((tpl->>'reward_points')::int, t.reward_points),
    case when tpl ? 'reward_id' then nullif(tpl->>'reward_id', '')::uuid else t.reward_id end,
    'pending', p_due, t.recurrence_rule, p_root
  );
end $$;

-- 編輯整個系列:choices 一併可改
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
    choices       = case when p_fields ? 'choices' then array(select jsonb_array_elements_text(p_fields->'choices')) else choices end,
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
