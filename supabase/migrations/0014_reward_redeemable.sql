-- 獎勵可設定「不開放積分兌換」(只能作為任務獎勵指定)
alter table public.rewards add column if not exists redeemable boolean not null default true;

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
