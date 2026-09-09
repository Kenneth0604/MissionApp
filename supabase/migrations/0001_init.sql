-- ============================================================================
-- MissionApp — 初始化 Schema
-- 在 Supabase Dashboard → SQL Editor 直接執行整份檔案。
--
-- 執行前請先在 Authentication → Users 建立兩個帳號(勾選 Auto Confirm):
--   Kenneth_Lin@missionapp.app  → A(顯示名稱 沼王)
--   Juniper_Kuo@missionapp.app  → B(顯示名稱 土王)
-- 若使用不同 email 或想改顯示名稱,請修改最底部「使用者對照」區塊。
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 資料表
-- ----------------------------------------------------------------------------
create table if not exists public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  code        text not null unique check (code in ('A', 'B')),
  name        text not null,
  created_at  timestamptz not null default now()
);

create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('task', 'reward')),
  name        text not null,
  emoji       text,
  sort_order  int  not null default 0,
  created_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists public.rewards (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  description  text not null default '',
  image_urls   text[] not null default '{}',
  category_id  uuid references public.categories(id) on delete set null,
  cost_points  int  not null default 0 check (cost_points >= 0),
  stock        int  not null default -1 check (stock >= -1),   -- -1 = 無限
  is_active    boolean not null default true,
  created_by   uuid not null references public.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.tasks (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  description      text not null default '',
  image_urls       text[] not null default '{}',
  category_id      uuid references public.categories(id) on delete set null,
  created_by       uuid not null references public.users(id),
  assigned_to      uuid not null references public.users(id),
  reward_type      text not null default 'points' check (reward_type in ('points', 'reward')),
  reward_points    int  not null default 0 check (reward_points >= 0),
  reward_id        uuid references public.rewards(id) on delete set null,
  status           text not null default 'pending'
                   check (status in ('pending', 'submitted', 'approved', 'rejected')),
  reject_reason    text,
  due_date         date,
  recurrence_rule  jsonb,          -- {"freq":"daily"} / {"freq":"weekly","day_of_week":3,"active":true}
  parent_task_id   uuid references public.tasks(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.redemptions (
  id               uuid primary key default gen_random_uuid(),
  reward_id        uuid not null references public.rewards(id),
  requested_by     uuid not null references public.users(id),
  status           text not null default 'requested'
                   check (status in ('requested', 'fulfilled', 'rejected')),
  cost_points      int  not null default 0 check (cost_points >= 0),  -- 申請當下的價格快照;任務獎勵為 0
  source           text not null default 'redeem' check (source in ('redeem', 'task')),
  related_task_id  uuid references public.tasks(id) on delete set null,
  reject_reason    text,
  handled_by       uuid references public.users(id),
  created_at       timestamptz not null default now(),
  fulfilled_at     timestamptz
);

create table if not exists public.points_ledger (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references public.users(id),
  amount                 int  not null,
  reason                 text not null,
  related_task_id        uuid references public.tasks(id) on delete set null,
  related_redemption_id  uuid references public.redemptions(id) on delete set null,
  created_at             timestamptz not null default now()
);

create table if not exists public.push_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  endpoint      text not null unique,
  subscription  jsonb not null,
  user_agent    text,
  created_at    timestamptz not null default now()
);

create index if not exists tasks_assigned_status_idx on public.tasks (assigned_to, status);
create index if not exists tasks_created_status_idx  on public.tasks (created_by, status);
create index if not exists ledger_user_idx           on public.points_ledger (user_id);
create index if not exists redemptions_status_idx    on public.redemptions (status);
create index if not exists push_user_idx             on public.push_subscriptions (user_id);

-- ----------------------------------------------------------------------------
-- updated_at 自動更新
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();

drop trigger if exists rewards_set_updated_at on public.rewards;
create trigger rewards_set_updated_at before update on public.rewards
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 輔助函式
-- ----------------------------------------------------------------------------
-- 目前登入者是否為 A / B 其中之一
create or replace function public.is_member()
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
     and exists (select 1 from public.users where id = auth.uid());
$$;

-- 使用者積分餘額 = ledger 加總(唯一真相來源)
create or replace function public.balance_of(p_user uuid)
returns int language sql stable security definer set search_path = public as $$
  select coalesce(sum(amount), 0)::int from public.points_ledger where user_id = p_user;
$$;

-- 已申請、尚未交付的兌換所佔用的積分
create or replace function public.reserved_of(p_user uuid)
returns int language sql stable security definer set search_path = public as $$
  select coalesce(sum(cost_points), 0)::int
  from public.redemptions
  where requested_by = p_user and status = 'requested';
$$;

-- 重複任務:計算下一期到期日
create or replace function public.next_due_date(rule jsonb, from_date date)
returns date language plpgsql stable as $$
declare
  freq  text := rule->>'freq';
  base  date := greatest(coalesce(from_date, current_date), current_date);
  dow   int;
  diff  int;
begin
  if freq = 'daily' then
    return base + 1;
  elsif freq = 'weekly' then
    dow  := coalesce((rule->>'day_of_week')::int, extract(dow from base)::int);
    diff := ((dow - extract(dow from base)::int) % 7 + 7) % 7;
    if diff = 0 then diff := 7; end if;
    return base + diff;
  end if;
  return null;
end $$;

create or replace function public.assert_member()
returns void language plpgsql stable as $$
begin
  if not public.is_member() then
    raise exception '未授權' using errcode = '42501';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 任務流程 RPC(security definer:前端不能直接改 status / 寫 ledger)
-- ----------------------------------------------------------------------------
create or replace function public.submit_task(p_task_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t public.tasks%rowtype;
begin
  perform public.assert_member();
  select * into t from public.tasks where id = p_task_id for update;
  if not found then raise exception '任務不存在'; end if;
  if t.assigned_to <> auth.uid() then raise exception '只有被指派者可以標記完成'; end if;
  if t.status not in ('pending', 'rejected') then raise exception '任務目前不能標記完成'; end if;
  update public.tasks set status = 'submitted' where id = p_task_id;
end $$;

create or replace function public.reject_task(p_task_id uuid, p_reason text default '')
returns void language plpgsql security definer set search_path = public as $$
declare t public.tasks%rowtype;
begin
  perform public.assert_member();
  select * into t from public.tasks where id = p_task_id for update;
  if not found then raise exception '任務不存在'; end if;
  if t.created_by <> auth.uid() then raise exception '只有建立者可以審核'; end if;
  if t.status <> 'submitted' then raise exception '任務不在待審核狀態'; end if;
  update public.tasks
     set status = 'rejected',
         reject_reason = coalesce(nullif(trim(p_reason), ''), '未填寫原因')
   where id = p_task_id;
end $$;

create or replace function public.approve_task(p_task_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  t         public.tasks%rowtype;
  rule      jsonb;
  next_due  date;
begin
  perform public.assert_member();
  select * into t from public.tasks where id = p_task_id for update;
  if not found then raise exception '任務不存在'; end if;
  if t.created_by <> auth.uid() then raise exception '只有建立者可以審核'; end if;
  if t.status <> 'submitted' then raise exception '任務不在待審核狀態'; end if;

  update public.tasks set status = 'approved', reject_reason = null where id = p_task_id;

  -- 發放獎勵
  if t.reward_type = 'points' then
    if t.reward_points > 0 then
      insert into public.points_ledger (user_id, amount, reason, related_task_id)
      values (t.assigned_to, t.reward_points, '任務完成:' || t.title, t.id);
    end if;
  elsif t.reward_type = 'reward' and t.reward_id is not null then
    -- 指定獎勵:建立一筆待交付的兌換,不扣點
    insert into public.redemptions (reward_id, requested_by, status, cost_points, source, related_task_id)
    values (t.reward_id, t.assigned_to, 'requested', 0, 'task', t.id);
  end if;

  -- 重複任務:核准後才產生下一期
  rule := t.recurrence_rule;
  if rule is not null and coalesce((rule->>'active')::boolean, true) then
    next_due := public.next_due_date(rule, t.due_date);
    insert into public.tasks (
      title, description, image_urls, category_id, created_by, assigned_to,
      reward_type, reward_points, reward_id, status, due_date, recurrence_rule, parent_task_id
    ) values (
      t.title, t.description, t.image_urls, t.category_id, t.created_by, t.assigned_to,
      t.reward_type, t.reward_points, t.reward_id, 'pending', next_due, rule, coalesce(t.parent_task_id, t.id)
    );
  end if;
end $$;

create or replace function public.stop_recurrence(p_task_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t public.tasks%rowtype;
begin
  perform public.assert_member();
  select * into t from public.tasks where id = p_task_id for update;
  if not found then raise exception '任務不存在'; end if;
  if t.created_by <> auth.uid() then raise exception '只有建立者可以停用重複'; end if;
  if t.recurrence_rule is null then return; end if;
  update public.tasks
     set recurrence_rule = t.recurrence_rule || jsonb_build_object('active', false)
   where id = p_task_id;
end $$;

-- ----------------------------------------------------------------------------
-- 兌換流程 RPC
-- ----------------------------------------------------------------------------
create or replace function public.request_redemption(p_reward_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  r          public.rewards%rowtype;
  available  int;
  new_id     uuid;
begin
  perform public.assert_member();
  select * into r from public.rewards where id = p_reward_id for update;
  if not found then raise exception '獎勵不存在'; end if;
  if not r.is_active then raise exception '這個獎勵已停用'; end if;
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
  if not found then raise exception '兌換紀錄不存在'; end if;
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
  if not found then raise exception '兌換紀錄不存在'; end if;
  if d.status <> 'requested' then raise exception '這筆兌換已處理過'; end if;
  update public.redemptions
     set status = 'rejected', handled_by = auth.uid(),
         reject_reason = nullif(trim(p_reason), '')
   where id = d.id;
end $$;

-- 只有已登入者能呼叫 RPC
revoke execute on function
  public.submit_task(uuid), public.approve_task(uuid), public.reject_task(uuid, text),
  public.stop_recurrence(uuid), public.request_redemption(uuid),
  public.fulfill_redemption(uuid), public.reject_redemption(uuid, text),
  public.balance_of(uuid), public.reserved_of(uuid)
from public, anon;
grant execute on function
  public.submit_task(uuid), public.approve_task(uuid), public.reject_task(uuid, text),
  public.stop_recurrence(uuid), public.request_redemption(uuid),
  public.fulfill_redemption(uuid), public.reject_redemption(uuid, text),
  public.balance_of(uuid), public.reserved_of(uuid), public.is_member()
to authenticated;

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------
alter table public.users              enable row level security;
alter table public.categories         enable row level security;
alter table public.rewards            enable row level security;
alter table public.tasks              enable row level security;
alter table public.redemptions        enable row level security;
alter table public.points_ledger      enable row level security;
alter table public.push_subscriptions enable row level security;

-- 匿名(anon key 未登入)完全不能碰資料表
revoke all on all tables in schema public from anon;

-- users:成員可讀,不可透過 API 寫
drop policy if exists users_select on public.users;
create policy users_select on public.users for select to authenticated using (public.is_member());

-- categories:成員可讀寫
drop policy if exists categories_select on public.categories;
drop policy if exists categories_insert on public.categories;
drop policy if exists categories_update on public.categories;
drop policy if exists categories_delete on public.categories;
create policy categories_select on public.categories for select to authenticated using (public.is_member());
create policy categories_insert on public.categories for insert to authenticated with check (public.is_member() and created_by = auth.uid());
create policy categories_update on public.categories for update to authenticated using (public.is_member()) with check (public.is_member());
create policy categories_delete on public.categories for delete to authenticated using (public.is_member());

-- rewards:成員可讀、新增、編輯(用 is_active 停用,不刪除)
drop policy if exists rewards_select on public.rewards;
drop policy if exists rewards_insert on public.rewards;
drop policy if exists rewards_update on public.rewards;
create policy rewards_select on public.rewards for select to authenticated using (public.is_member());
create policy rewards_insert on public.rewards for insert to authenticated with check (public.is_member() and created_by = auth.uid());
create policy rewards_update on public.rewards for update to authenticated using (public.is_member()) with check (public.is_member());

-- tasks:成員可讀;建立者只能在 pending 狀態下直接編輯 / 刪除;狀態流轉走 RPC
drop policy if exists tasks_select on public.tasks;
drop policy if exists tasks_insert on public.tasks;
drop policy if exists tasks_update on public.tasks;
drop policy if exists tasks_delete on public.tasks;
create policy tasks_select on public.tasks for select to authenticated using (public.is_member());
create policy tasks_insert on public.tasks for insert to authenticated
  with check (public.is_member() and created_by = auth.uid() and status = 'pending'
              and exists (select 1 from public.users where id = assigned_to));
create policy tasks_update on public.tasks for update to authenticated
  using (created_by = auth.uid() and status = 'pending')
  with check (created_by = auth.uid() and status = 'pending');
create policy tasks_delete on public.tasks for delete to authenticated
  using (created_by = auth.uid() and status = 'pending');

-- redemptions / points_ledger:只能讀;所有寫入都在 RPC 內
drop policy if exists redemptions_select on public.redemptions;
create policy redemptions_select on public.redemptions for select to authenticated using (public.is_member());

drop policy if exists ledger_select on public.points_ledger;
create policy ledger_select on public.points_ledger for select to authenticated using (public.is_member());

-- push_subscriptions:只能管理自己的裝置
drop policy if exists push_select on public.push_subscriptions;
drop policy if exists push_insert on public.push_subscriptions;
drop policy if exists push_update on public.push_subscriptions;
drop policy if exists push_delete on public.push_subscriptions;
create policy push_select on public.push_subscriptions for select to authenticated using (user_id = auth.uid());
create policy push_insert on public.push_subscriptions for insert to authenticated with check (public.is_member() and user_id = auth.uid());
create policy push_update on public.push_subscriptions for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy push_delete on public.push_subscriptions for delete to authenticated using (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- Storage:任務 / 獎勵圖片(公開讀取,僅成員可上傳 / 刪除)
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('images', 'images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true;

drop policy if exists "images public read"   on storage.objects;
drop policy if exists "images member insert" on storage.objects;
drop policy if exists "images member delete" on storage.objects;
create policy "images public read"   on storage.objects for select using (bucket_id = 'images');
create policy "images member insert" on storage.objects for insert to authenticated with check (bucket_id = 'images' and public.is_member());
create policy "images member delete" on storage.objects for delete to authenticated using (bucket_id = 'images' and public.is_member());

-- ----------------------------------------------------------------------------
-- Keep-alive:免費方案 7 天無活動會暫停專案。
-- GitHub Actions(.github/workflows/keep-alive.yml)每 3 天以 anon key 呼叫
-- rpc/keep_alive,寫入一筆心跳讓專案保持活躍。
-- ----------------------------------------------------------------------------
create table if not exists public.heartbeats (
  id         int primary key default 1 check (id = 1),
  last_ping  timestamptz not null default now(),
  source     text
);
insert into public.heartbeats (id) values (1) on conflict (id) do nothing;
alter table public.heartbeats enable row level security;   -- 無 policy:只能透過下方函式寫入
revoke all on public.heartbeats from anon, authenticated;

create or replace function public.keep_alive(p_source text default 'github-actions')
returns timestamptz language sql security definer set search_path = public as $$
  update public.heartbeats set last_ping = now(), source = p_source where id = 1 returning last_ping;
$$;
grant execute on function public.keep_alive(text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Realtime:把資料表加進 supabase_realtime publication
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['tasks', 'points_ledger', 'rewards', 'redemptions', 'categories'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then
      null; -- 已加入
    end;
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 使用者對照:把 Auth 帳號綁到 A / B
-- (若你用了不同 email,請改這兩行)
-- ----------------------------------------------------------------------------
insert into public.users (id, code, name)
select id, 'A', '沼王' from auth.users where lower(email) = lower('Kenneth_Lin@missionapp.app')
on conflict (id) do nothing;

insert into public.users (id, code, name)
select id, 'B', '土王' from auth.users where lower(email) = lower('Juniper_Kuo@missionapp.app')
on conflict (id) do nothing;

-- 檢查:應該要看到兩列
select code, id from public.users order by code;
