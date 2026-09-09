-- 類別改為「名稱 + 文字說明」,不再使用表情符號欄位(舊欄位保留,不影響既有資料)
alter table public.categories add column if not exists description text;

-- 顯示名稱調整
update public.users set name = '沼王' where code = 'A';
update public.users set name = '土王' where code = 'B';
