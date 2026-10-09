-- ============================================================================
-- 開放註冊:帳號 + 密碼登入,「兩人一組」+ 邀請碼
--
-- - 新增 pairs(組別);每個帳號只屬於一組,每組最多兩人(code A / B,組內唯一)
-- - 所有資料表加上 pair_id,由觸發器依「擁有者」欄位自動填入(前端不用傳,也無法偽造),
--   並檢查所有關聯欄位(指派對象、類別、獎勵…)都屬於同一組
-- - RLS 一律改成「只能看 / 改自己這一組」;所有 RPC 加上組別檢查
-- - create_pair / join_pair:註冊後建立新組(拿到邀請碼),或用邀請碼加入對方的組
-- - 既有的兩位使用者與所有舊資料自動歸到第一組,原本的帳號密碼照常可用
--
-- 執行前(Supabase Dashboard):
--   Authentication → Sign In / Providers → 開啟「Allow new users to sign up」,
--   並關閉 Email 的「Confirm email」(帳號使用不會收信的內部信箱,開著會永遠無法登入)
-- 執行後:重新部署 Edge Function(supabase functions deploy push-notify --no-verify-jwt),
--   新版只會推播給同一組的人
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 組別
-- ----------------------------------------------------------------------------
create table if not exists public.pairs (
  id           uuid primary key default gen_random_uuid(),
  invite_code  text not null unique,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

-- 6 碼邀請碼(去掉容易看錯的 0 O 1 I);亂數取自 gen_random_uuid 的前 6 個 byte
create or replace function public.gen_invite_code()
returns text language plpgsql volatile set search_path = public as $$
declare
  alphabet  text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   -- 32 個字元
  b         bytea;
  c         text;
  i         int;
begin
  loop
    b := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
    c := '';
    for i in 0..5 loop
      c := c || substr(alphabet, 1 + (get_byte(b, i) % 32), 1);
    end loop;
    exit when not exists (select 1 from public.pairs where invite_code = c);
  end loop;
  return c;
end $$;

-- users:加上 pair_id,code(A / B)改成組內唯一
alter table public.users add column if not exists pair_id uuid references public.pairs(id) on delete cascade;
alter table public.users drop constraint if exists users_code_key;
do $$ begin
  alter table public.users add constraint users_pair_code_key unique (pair_id, code);
exception when duplicate_object or duplicate_table then null;
end $$;

-- 其他資料表:加上 pair_id
alter table public.categories    add column if not exists pair_id uuid references public.pairs(id) on delete cascade;
alter table public.rewards       add column if not exists pair_id uuid references public.pairs(id) on delete cascade;
alter table public.tasks         add column if not exists pair_id uuid references public.pairs(id) on delete cascade;
alter table public.redemptions   add column if not exists pair_id uuid references public.pairs(id) on delete cascade;
alter table public.points_ledger add column if not exists pair_id uuid references public.pairs(id) on delete cascade;
alter table public.task_presets  add column if not exists pair_id uuid references public.pairs(id) on delete cascade;

-- ----------------------------------------------------------------------------
-- 既有資料:原本的兩位使用者與所有資料歸到第一組
-- ----------------------------------------------------------------------------
do $$
declare
  v_pair     uuid;
  v_creator  uuid;
begin
  if exists (select 1 from public.users where pair_id is null) then
    select id into v_creator from public.users where pair_id is null order by code limit 1;
    insert into public.pairs (invite_code, created_by)
    values (public.gen_invite_code(), v_creator)
    returning id into v_pair;
    update public.users set pair_id = v_pair where pair_id is null;
  else
    select id into v_pair from public.pairs order by created_at limit 1;
  end if;

  if v_pair is not null then
    update public.categories    set pair_id = v_pair where pair_id is null;
    update public.rewards       set pair_id = v_pair where pair_id is null;
    update public.tasks         set pair_id = v_pair where pair_id is null;
    update public.redemptions   set pair_id = v_pair where pair_id is null;
    update public.points_ledger set pair_id = v_pair where pair_id is null;
    update public.task_presets  set pair_id = v_pair where pair_id is null;
  end if;
end $$;

alter table public.users         alter column pair_id set not null;
alter table public.categories    alter column pair_id set not null;
alter table public.rewards       alter column pair_id set not null;
alter table public.tasks         alter column pair_id set not null;
alter table public.redemptions   alter column pair_id set not null;
alter table public.points_ledger alter column pair_id set not null;
alter table public.task_presets  alter column pair_id set not null;

create index if not exists users_pair_idx         on public.users (pair_id);
create index if not exists categories_pair_idx    on public.categories (pair_id);
create index if not exists rewards_pair_idx       on public.rewards (pair_id);
create index if not exists tasks_pair_idx         on public.tasks (pair_id);
create index if not exists redemptions_pair_idx   on public.redemptions (pair_id);
create index if not exists ledger_pair_idx        on public.points_ledger (pair_id);
create index if not exists task_presets_pair_idx  on public.task_presets (pair_id);

-- ----------------------------------------------------------------------------
-- 輔助函式
-- ----------------------------------------------------------------------------
-- 目前登入者所屬的組(未加入任何組則為 null)
create or replace function public.my_pair()
returns uuid language sql stable security definer set search_path = public as $$
  select pair_id from public.users where id = auth.uid();
$$;

-- 已加入某一組才算成員
create or replace function public.is_member()
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
     and exists (select 1 from public.users where id = auth.uid() and pair_id is not null);
$$;

-- 新增:pair_id 依擁有者欄位(tg_argv[0])決定,不採用前端傳來的值;修改:pair_id 不可變更。
-- 其餘參數為 '欄位=資料表',檢查這些關聯都屬於同一組。
create or replace function public.apply_pair_scope()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_owner     text;
  v_pair      uuid;
  v_ref_pair  uuid;
  v_row       jsonb;
  v_col       text;
  v_tbl       text;
  v_val       text;
  i           int;
begin
  if tg_op = 'UPDATE' then
    new.pair_id := old.pair_id;
  else
    v_owner := to_jsonb(new) ->> tg_argv[0];
    if v_owner is not null then
      select pair_id into v_pair from public.users where id = v_owner::uuid;
    end if;
    new.pair_id := coalesce(v_pair, public.my_pair());
    if new.pair_id is null then
      raise exception '找不到所屬的組別' using errcode = '42501';
    end if;
  end if;

  v_row := to_jsonb(new);
  for i in 1 .. tg_nargs - 1 loop
    v_col := split_part(tg_argv[i], '=', 1);
    v_tbl := split_part(tg_argv[i], '=', 2);
    v_val := v_row ->> v_col;
    if v_val is not null then
      v_ref_pair := null;
      execute format('select pair_id from public.%I where id = $1', v_tbl) into v_ref_pair using v_val::uuid;
      if v_ref_pair is distinct from new.pair_id then
        raise exception '資料不屬於同一個組別(%)', v_col using errcode = '42501';
      end if;
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists categories_pair_scope on public.categories;
create trigger categories_pair_scope before insert or update on public.categories
  for each row execute function public.apply_pair_scope('created_by', 'parent_id=categories');

drop trigger if exists rewards_pair_scope on public.rewards;
create trigger rewards_pair_scope before insert or update on public.rewards
  for each row execute function public.apply_pair_scope('created_by', 'category_id=categories');

drop trigger if exists tasks_pair_scope on public.tasks;
create trigger tasks_pair_scope before insert or update on public.tasks
  for each row execute function public.apply_pair_scope(
    'created_by', 'assigned_to=users', 'completed_by=users', 'category_id=categories', 'reward_id=rewards', 'parent_task_id=tasks'
  );

drop trigger if exists redemptions_pair_scope on public.redemptions;
create trigger redemptions_pair_scope before insert or update on public.redemptions
  for each row execute function public.apply_pair_scope('requested_by', 'reward_id=rewards', 'related_task_id=tasks', 'handled_by=users');

drop trigger if exists points_ledger_pair_scope on public.points_ledger;
create trigger points_ledger_pair_scope before insert or update on public.points_ledger
  for each row execute function public.apply_pair_scope('user_id', 'related_task_id=tasks', 'related_redemption_id=redemptions');

drop trigger if exists task_presets_pair_scope on public.task_presets;
create trigger task_presets_pair_scope before insert or update on public.task_presets
  for each row execute function public.apply_pair_scope('created_by', 'assigned_to=users', 'category_id=categories', 'reward_id=rewards');

-- ----------------------------------------------------------------------------
-- 建立 / 加入組別
-- ----------------------------------------------------------------------------
create or replace function public.create_pair(p_display_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_name  text := left(trim(coalesce(p_display_name, '')), 20);
  v_pair  uuid;
begin
  if auth.uid() is null then raise exception '未登入' using errcode = '42501'; end if;
  if v_name = '' then raise exception '請輸入顯示名稱'; end if;
  if exists (select 1 from public.users where id = auth.uid()) then
    raise exception '你已經在一個組別裡了';
  end if;
  insert into public.pairs (invite_code, created_by)
  values (public.gen_invite_code(), auth.uid())
  returning id into v_pair;
  insert into public.users (id, pair_id, code, name) values (auth.uid(), v_pair, 'A', v_name);
  return v_pair;
end $$;

create or replace function public.join_pair(p_code text, p_display_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_name   text := left(trim(coalesce(p_display_name, '')), 20);
  v_pair   uuid;
  v_mine   uuid;
  v_taken  text[];
begin
  if auth.uid() is null then raise exception '未登入' using errcode = '42501'; end if;
  if v_name = '' then raise exception '請輸入顯示名稱'; end if;

  select id into v_pair from public.pairs where invite_code = upper(trim(coalesce(p_code, ''))) for update;
  if v_pair is null then raise exception '找不到這個邀請碼'; end if;

  select pair_id into v_mine from public.users where id = auth.uid();
  if v_mine = v_pair then return v_pair; end if;
  if v_mine is not null then raise exception '你已經在一個組別裡了'; end if;

  select coalesce(array_agg(code), '{}') into v_taken from public.users where pair_id = v_pair;
  if coalesce(array_length(v_taken, 1), 0) >= 2 then raise exception '這個組別已經滿兩個人了'; end if;

  insert into public.users (id, pair_id, code, name)
  values (auth.uid(), v_pair, case when 'A' = any(v_taken) then 'B' else 'A' end, v_name);
  return v_pair;
end $$;

-- 修改自己的顯示名稱
create or replace function public.set_my_name(p_name text)
returns void language plpgsql security definer set search_path = public as $$
declare v_name text := left(trim(coalesce(p_name, '')), 20);
begin
  if v_name = '' then raise exception '請輸入顯示名稱'; end if;
  update public.users set name = v_name where id = auth.uid();
  if not found then raise exception '尚未加入組別'; end if;
end $$;

revoke execute on function public.gen_invite_code() from public, anon, authenticated;
revoke execute on function public.apply_pair_scope() from public, anon, authenticated;
revoke execute on function
  public.create_pair(text), public.join_pair(text, text), public.set_my_name(text), public.my_pair()
from public, anon;
grant execute on function
  public.create_pair(text), public.join_pair(text, text), public.set_my_name(text), public.my_pair(), public.is_member()
to authenticated;

-- 積分 / 佔用查詢只在 RPC 內部使用,不開放直接呼叫(避免查到別組的積分)
revoke execute on function public.balance_of(uuid), public.reserved_of(uuid) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- Row Level Security:只能存取自己這一組
-- ----------------------------------------------------------------------------
alter table public.pairs enable row level security;
revoke all on public.pairs from anon;
drop policy if exists pairs_select on public.pairs;
create policy pairs_select on public.pairs for select to authenticated using (id = public.my_pair());

drop policy if exists users_select on public.users;
create policy users_select on public.users for select to authenticated using (pair_id = public.my_pair());

drop policy if exists categories_select on public.categories;
drop policy if exists categories_insert on public.categories;
drop policy if exists categories_update on public.categories;
drop policy if exists categories_delete on public.categories;
create policy categories_select on public.categories for select to authenticated using (pair_id = public.my_pair());
create policy categories_insert on public.categories for insert to authenticated
  with check (pair_id = public.my_pair() and created_by = auth.uid());
create policy categories_update on public.categories for update to authenticated
  using (pair_id = public.my_pair()) with check (pair_id = public.my_pair());
create policy categories_delete on public.categories for delete to authenticated using (pair_id = public.my_pair());

drop policy if exists rewards_select on public.rewards;
drop policy if exists rewards_insert on public.rewards;
drop policy if exists rewards_update on public.rewards;
create policy rewards_select on public.rewards for select to authenticated using (pair_id = public.my_pair());
create policy rewards_insert on public.rewards for insert to authenticated
  with check (pair_id = public.my_pair() and created_by = auth.uid());
create policy rewards_update on public.rewards for update to authenticated
  using (pair_id = public.my_pair()) with check (pair_id = public.my_pair());

drop policy if exists tasks_select on public.tasks;
drop policy if exists tasks_insert on public.tasks;
drop policy if exists tasks_update on public.tasks;
drop policy if exists tasks_delete on public.tasks;
create policy tasks_select on public.tasks for select to authenticated using (pair_id = public.my_pair());
create policy tasks_insert on public.tasks for insert to authenticated
  with check (
    pair_id = public.my_pair() and created_by = auth.uid() and status = 'pending'
    and ((shared and assigned_to is null) or assigned_to is not null)
  );
create policy tasks_update on public.tasks for update to authenticated
  using (pair_id = public.my_pair() and status in ('pending', 'rejected'))
  with check (pair_id = public.my_pair() and status in ('pending', 'rejected'));
create policy tasks_delete on public.tasks for delete to authenticated
  using (pair_id = public.my_pair() and status in ('pending', 'rejected'));

drop policy if exists redemptions_select on public.redemptions;
create policy redemptions_select on public.redemptions for select to authenticated using (pair_id = public.my_pair());

drop policy if exists ledger_select on public.points_ledger;
create policy ledger_select on public.points_ledger for select to authenticated using (pair_id = public.my_pair());

drop policy if exists task_presets_select on public.task_presets;
drop policy if exists task_presets_insert on public.task_presets;
drop policy if exists task_presets_update on public.task_presets;
drop policy if exists task_presets_delete on public.task_presets;
create policy task_presets_select on public.task_presets for select to authenticated using (pair_id = public.my_pair());
create policy task_presets_insert on public.task_presets for insert to authenticated
  with check (pair_id = public.my_pair() and created_by = auth.uid());
create policy task_presets_update on public.task_presets for update to authenticated
  using (pair_id = public.my_pair()) with check (pair_id = public.my_pair());
create policy task_presets_delete on public.task_presets for delete to authenticated using (pair_id = public.my_pair());

-- Storage:圖片路徑為 <資料夾>/<上傳者 user id>/<檔名>;只能上傳到自己的資料夾,只能刪除同組成員上傳的圖片
drop policy if exists "images member insert" on storage.objects;
drop policy if exists "images member delete" on storage.objects;
create policy "images member insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'images' and public.is_member() and (storage.foldername(name))[2] = auth.uid()::text);
create policy "images member delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'images'
    and exists (
      select 1 from public.users u
      where u.id::text = (storage.foldername(objects.name))[2] and u.pair_id = public.my_pair()   -- 注意:users 也有 name 欄位,必須寫 objects.name
    )
  );

-- ----------------------------------------------------------------------------
-- RPC:加上組別檢查(其餘邏輯與 0010 / 0013 / 0014 / 0015 / 0017 相同)
-- ----------------------------------------------------------------------------
create or replace function public.can_review(t public.tasks)
returns boolean language sql stable as $$
  select t.completed_by is not null and t.completed_by <> auth.uid()
     and public.is_member() and t.pair_id = public.my_pair();
$$;

create or replace function public.submit_task(p_task_id uuid, p_choice text default null, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare t public.tasks%rowtype;
begin
  perform public.assert_member();
  select * into t from public.tasks where id = p_task_id for update;
  if not found or t.pair_id is distinct from public.my_pair() then raise exception '任務不存在'; end if;
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

create or replace function public.reject_task(p_task_id uuid, p_reason text default '')
returns void language plpgsql security definer set search_path = public as $$
declare t public.tasks%rowtype;
begin
  perform public.assert_member();
  select * into t from public.tasks where id = p_task_id for update;
  if not found or t.pair_id is distinct from public.my_pair() then raise exception '任務不存在'; end if;
  if not public.can_review(t) then raise exception '你不能審核這筆任務'; end if;
  if t.status <> 'submitted' then raise exception '任務不在待審核狀態'; end if;
  update public.tasks
     set status = 'rejected',
         reject_reason = coalesce(nullif(trim(p_reason), ''), '未填寫原因')
   where id = p_task_id;
end $$;

create or replace function public.approve_task(p_task_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t public.tasks%rowtype;
begin
  perform public.assert_member();
  select * into t from public.tasks where id = p_task_id for update;
  if not found or t.pair_id is distinct from public.my_pair() then raise exception '任務不存在'; end if;
  if not public.can_review(t) then raise exception '你不能審核這筆任務'; end if;
  if t.status <> 'submitted' then raise exception '任務不在待審核狀態'; end if;
  update public.tasks set status = 'approved', reject_reason = null where id = p_task_id;
  perform public.finalize_approval(t);
end $$;

create or replace function public.withdraw_task(p_task_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t public.tasks%rowtype;
begin
  perform public.assert_member();
  select * into t from public.tasks where id = p_task_id for update;
  if not found or t.pair_id is distinct from public.my_pair() then raise exception '任務不存在'; end if;
  if t.status <> 'submitted' then raise exception '任務不在待審核狀態'; end if;
  if t.completed_by <> auth.uid() then raise exception '只有送出審核的人可以撤回'; end if;
  update public.tasks set status = 'pending', completed_by = null, chosen_choice = null where id = p_task_id;
end $$;

create or replace function public.update_series(p_task_id uuid, p_fields jsonb, p_rule jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare t public.tasks%rowtype; root uuid; n int;
begin
  perform public.assert_member();
  select * into t from public.tasks where id = p_task_id;
  if not found or t.pair_id is distinct from public.my_pair() then raise exception '任務不存在'; end if;
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
    and pair_id = t.pair_id
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
  if not found or t.pair_id is distinct from public.my_pair() then raise exception '任務不存在'; end if;
  if t.recurrence_rule is null then return; end if;
  root := coalesce(t.parent_task_id, t.id);
  update public.tasks
     set recurrence_rule = recurrence_rule || jsonb_build_object('active', false)
   where recurrence_rule is not null
     and coalesce(parent_task_id, id) = root
     and pair_id = t.pair_id
     and status in ('pending', 'rejected', 'submitted');
end $$;

create or replace function public.set_task_note(p_task_id uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_member();
  update public.tasks set note = nullif(trim(coalesce(p_note, '')), '')
   where id = p_task_id and pair_id = public.my_pair();
  if not found then raise exception '任務不存在'; end if;
end $$;

create or replace function public.request_redemption(p_reward_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  r          public.rewards%rowtype;
  available  int;
  new_id     uuid;
begin
  perform public.assert_member();
  select * into r from public.rewards where id = p_reward_id for update;
  if not found or r.pair_id is distinct from public.my_pair() then raise exception '獎勵不存在'; end if;
  if not r.is_active then raise exception '這個獎勵已停用'; end if;
  if not r.redeemable then raise exception '這個獎勵不開放積分兌換,只能透過任務獲得'; end if;
  if r.stock = 0 then raise exception '這個獎勵已兌換完'; end if;

  available := public.balance_of(auth.uid()) - public.reserved_of(auth.uid());
  if available < r.cost_points then
    raise exception '積分不足(可用 % 點,需要 % 點)', available, r.cost_points;
  end if;

  insert into public.redemptions (reward_id, requested_by, status, cost_points, source)
  values (r.id, auth.uid(), 'requested', r.cost_points, 'redeem')
  returning id into new_id;
  return new_id;
end $$;

create or replace function public.fulfill_redemption(p_redemption_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  d public.redemptions%rowtype;
  r public.rewards%rowtype;
begin
  perform public.assert_member();
  select * into d from public.redemptions where id = p_redemption_id for update;
  if not found or d.pair_id is distinct from public.my_pair() then raise exception '兌換紀錄不存在'; end if;
  if d.status <> 'requested' then raise exception '這筆兌換已處理過'; end if;
  if d.requested_by = auth.uid() then raise exception '不能確認自己的兌換,請由對方確認'; end if;

  select * into r from public.rewards where id = d.reward_id for update;

  if d.cost_points > 0 then
    if public.balance_of(d.requested_by) < d.cost_points then
      raise exception '對方積分不足,無法交付';
    end if;
    insert into public.points_ledger (user_id, amount, reason, related_redemption_id)
    values (d.requested_by, -d.cost_points, '兌換獎勵:' || r.name, d.id);
  end if;

  if r.stock = 0 then
    raise exception '庫存不足';
  elsif r.stock > 0 then
    update public.rewards set stock = stock - 1 where id = r.id;
  end if;

  update public.redemptions
     set status = 'fulfilled', fulfilled_at = now(), handled_by = auth.uid()
   where id = d.id;
end $$;

create or replace function public.reject_redemption(p_redemption_id uuid, p_reason text default '')
returns void language plpgsql security definer set search_path = public as $$
declare d public.redemptions%rowtype;
begin
  perform public.assert_member();
  select * into d from public.redemptions where id = p_redemption_id for update;
  if not found or d.pair_id is distinct from public.my_pair() then raise exception '兌換紀錄不存在'; end if;
  if d.status <> 'requested' then raise exception '這筆兌換已處理過'; end if;
  update public.redemptions
     set status = 'rejected', handled_by = auth.uid(),
         reject_reason = nullif(trim(p_reason), '')
   where id = d.id;
end $$;

-- ----------------------------------------------------------------------------
-- Realtime:users 也加入(對方加入 / 改名時即時更新)
-- ----------------------------------------------------------------------------
do $$ begin
  execute 'alter publication supabase_realtime add table public.users';
exception when duplicate_object then null;
end $$;

commit;

-- 檢查:每一組的成員
select p.invite_code, u.code, u.name from public.pairs p join public.users u on u.pair_id = p.id order by p.created_at, u.code;
