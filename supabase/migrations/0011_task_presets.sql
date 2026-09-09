-- ============================================================================
-- 快捷任務(任務範本)
-- 事先設定好常用的任務內容(標題、類別、優先程度、獎勵、多選項…),
-- 建立任務時可以直接選一個套用,不用每次重新填。雙方共用同一份清單。
-- ============================================================================

create table if not exists public.task_presets (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  description    text not null default '',
  category_id    uuid references public.categories(id) on delete set null,
  priority       smallint not null default 3 check (priority between 1 and 5),
  choices        text[],
  reward_type    text not null default 'points' check (reward_type in ('points', 'reward', 'none')),
  reward_points  int  not null default 0 check (reward_points >= 0),
  reward_id      uuid references public.rewards(id) on delete set null,
  sort_order     int  not null default 0,
  created_by     uuid not null references public.users(id),
  created_at     timestamptz not null default now()
);

alter table public.task_presets enable row level security;
revoke all on public.task_presets from anon;

drop policy if exists task_presets_select on public.task_presets;
drop policy if exists task_presets_insert on public.task_presets;
drop policy if exists task_presets_update on public.task_presets;
drop policy if exists task_presets_delete on public.task_presets;
create policy task_presets_select on public.task_presets for select to authenticated using (public.is_member());
create policy task_presets_insert on public.task_presets for insert to authenticated with check (public.is_member() and created_by = auth.uid());
create policy task_presets_update on public.task_presets for update to authenticated using (public.is_member()) with check (public.is_member());
create policy task_presets_delete on public.task_presets for delete to authenticated using (public.is_member());

do $$ begin
  execute 'alter publication supabase_realtime add table public.task_presets';
exception when duplicate_object then null;
end $$;
