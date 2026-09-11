-- ============================================================================
-- 任務可由任一方編輯 / 刪除(不限建立者),狀態為待完成或已退回時皆可;
-- 完成者可以撤回自己送出的審核(submitted → pending),撤回後與原本一樣可編輯。
-- ============================================================================

drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks for update to authenticated
  using (public.is_member() and status in ('pending', 'rejected'))
  with check (public.is_member() and status in ('pending', 'rejected'));

drop policy if exists tasks_delete on public.tasks;
create policy tasks_delete on public.tasks for delete to authenticated
  using (public.is_member() and status in ('pending', 'rejected'));

-- 撤回審核:只有完成者本人可以,任務回到待完成
create or replace function public.withdraw_task(p_task_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t public.tasks%rowtype;
begin
  perform public.assert_member();
  select * into t from public.tasks where id = p_task_id for update;
  if not found then raise exception '任務不存在'; end if;
  if t.status <> 'submitted' then raise exception '任務不在待審核狀態'; end if;
  if t.completed_by <> auth.uid() then raise exception '只有送出審核的人可以撤回'; end if;
  update public.tasks set status = 'pending', completed_by = null, chosen_choice = null where id = p_task_id;
end $$;
revoke execute on function public.withdraw_task(uuid) from public, anon;
grant execute on function public.withdraw_task(uuid) to authenticated;

-- 編輯整個系列 / 停用重複:任一方皆可
create or replace function public.update_series(p_task_id uuid, p_fields jsonb, p_rule jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare t public.tasks%rowtype; root uuid; n int;
begin
  perform public.assert_member();
  select * into t from public.tasks where id = p_task_id;
  if not found then raise exception '任務不存在'; end if;
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

create or replace function public.stop_recurrence(p_task_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t public.tasks%rowtype; root uuid;
begin
  perform public.assert_member();
  select * into t from public.tasks where id = p_task_id for update;
  if not found then raise exception '任務不存在'; end if;
  if t.recurrence_rule is null then return; end if;
  root := coalesce(t.parent_task_id, t.id);
  update public.tasks
     set recurrence_rule = recurrence_rule || jsonb_build_object('active', false)
   where recurrence_rule is not null
     and coalesce(parent_task_id, id) = root
     and status in ('pending', 'rejected', 'submitted');
end $$;
