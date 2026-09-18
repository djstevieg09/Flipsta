-- 0035: fixes a real bug in 0034's buy_deal_slot() found via the Supabase
-- security advisor flagging it as callable by the `anon` role (same
-- flag credit_flippy_coins already carries, a known pre-existing gap — but
-- for buy_deal_slot this pointed at something worse: `if p_profile_id <>
-- auth.uid()` uses plain `<>`, and in PL/pgSQL, comparing anything to a
-- NULL auth.uid() (i.e. an unauthenticated/anon caller) evaluates to NULL,
-- which `IF` treats as false — so the "not authorized" branch never fires
-- for an anon caller, and the function falls through to the real logic
-- instead of rejecting them. `IS DISTINCT FROM` is null-safe (unlike
-- `<>`/`=`) and is what this should have used from the start.
--
-- Also explicitly revokes EXECUTE from `anon` — the earlier
-- "revoke all ... from public; grant ... to authenticated" in 0034 doesn't
-- actually cover this: `anon` has its own separate EXECUTE grant from
-- Supabase's default privileges on every new function, which a revoke
-- from the PUBLIC pseudo-role does not touch.
create or replace function buy_deal_slot(p_opportunity_id uuid, p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_opp record;
  v_taken integer;
  v_new_balance integer;
begin
  if p_profile_id is distinct from auth.uid() or auth.uid() is null then
    raise exception 'Not authorized.';
  end if;

  select id, status, pricing_mode, fixed_price_coins, estimated_stock_units, batch_number, product_name
    into v_opp
    from opportunities
    where id = p_opportunity_id
    for update;

  if v_opp.id is null then
    raise exception 'Deal not found.';
  end if;
  if v_opp.pricing_mode is distinct from 'fixed_price' then
    raise exception 'This deal is not available as a fixed-price purchase.';
  end if;
  if v_opp.status <> 'live' then
    raise exception 'This deal is no longer available.';
  end if;

  select count(*) into v_taken from opportunity_slot_purchases where opportunity_id = p_opportunity_id;
  if v_taken >= v_opp.estimated_stock_units then
    update opportunities set status = 'sold_out' where id = p_opportunity_id;
    raise exception 'Sold out — every slot on this deal has already been taken.';
  end if;

  if exists (select 1 from opportunity_slot_purchases where opportunity_id = p_opportunity_id and profile_id = p_profile_id) then
    raise exception 'You already have a slot on this deal.';
  end if;

  select credit_flippy_coins(p_profile_id, -v_opp.fixed_price_coins, 'spend', null, 'Deal slot: ' || coalesce(v_opp.product_name, 'opportunity'))
    into v_new_balance;

  insert into opportunity_slot_purchases (opportunity_id, profile_id, price_coins, batch_number)
    values (p_opportunity_id, p_profile_id, v_opp.fixed_price_coins, v_opp.batch_number);

  if v_taken + 1 >= v_opp.estimated_stock_units then
    update opportunities set status = 'sold_out' where id = p_opportunity_id;
  end if;

  return jsonb_build_object('ok', true, 'priceCoins', v_opp.fixed_price_coins, 'newBalance', v_new_balance);
end;
$$;

revoke all on function buy_deal_slot(uuid, uuid) from public;
revoke all on function buy_deal_slot(uuid, uuid) from anon;
grant execute on function buy_deal_slot(uuid, uuid) to authenticated;
