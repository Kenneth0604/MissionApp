-- 類別改為主類別 / 次類別兩層:次類別的 parent_id 指向主類別;刪主類別時次類別一併刪除,
-- 用到該類別的任務 / 獎勵會變成未分類(既有 FK on delete set null)。
alter table public.categories
  add column if not exists parent_id uuid references public.categories(id) on delete cascade;

create index if not exists categories_parent_idx on public.categories (parent_id);
