-- 快捷任務可指定對象(A / B / 共同)
alter table public.task_presets add column if not exists assigned_to uuid references public.users(id) on delete set null;
alter table public.task_presets add column if not exists shared boolean not null default false;
