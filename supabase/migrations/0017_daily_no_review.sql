-- 每日任務(有重複規則)完成即核准,不需審核;一般任務照常進待審核。
-- (0016 的換日補新一期邏輯保留:待審核的一般狀況不會再出現在每日任務,但仍相容)
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
