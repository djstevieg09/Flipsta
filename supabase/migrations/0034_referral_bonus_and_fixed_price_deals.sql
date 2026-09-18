-- 0034: three-part feature, 18 Sept 2026, Steven verbatim:
-- "when people sign up and fill in there details we ask for their friends
-- email and name etc and then give them an extra 5 coins for the effort
-- and then when their friend signs up they both get 15 coins each. Also we
-- are moving away from the bid and instant win on the site. a finite deal
-- found with limited stock we are offering to one person, do the math to
-- work out the price. remenber 1 coin = £1 so just like before. if there is
-- a good supply chain work out the amount of people we can offer this to
-- so they all make a good profit. say 10 and then if sales are booming
-- then release to another 10... get rid of bidding and have a fixed
-- price... Also when someone make profit from a sale then it shoudl ask
-- them to share it to social media, they get a free coin for sharing."
--
-- Part 1 — friend_invites: a SEPARATE mechanic from the existing
-- referral_code/referred_by link-sharing program (migration 0016, still
-- untouched and still paying its own £5/£5 GBP wallet credit). This one is
-- captured directly on the signup form ("fill in their details we ask for
-- their friends email and name") rather than via a shared link, and pays
-- in Flippy Coins, not GBP.
create table friend_invites (
  id uuid primary key default gen_random_uuid(),
  inviter_id uuid not null references profiles(id) on delete cascade,
  friend_name text not null,
  friend_email text not null,
  status text not null default 'pending' check (status in ('pending', 'fulfilled')),
  fulfilled_by uuid references profiles(id),
  fulfilled_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_friend_invites_inviter on friend_invites(inviter_id);
-- Case-insensitive lookup — handle_new_user() below matches a new signup's
-- email against pending invites regardless of how either side cased it.
create index idx_friend_invites_friend_email on friend_invites(lower(friend_email)) where status = 'pending';

alter table friend_invites enable row level security;
create policy "friend invites are readable by their inviter" on friend_invites for select using (auth.uid() = inviter_id);
-- No insert/update policy for authenticated users — every row is written
-- by handle_new_user() below (SECURITY DEFINER), never directly by a client,
-- same reasoning as coin_transactions in migration 0031.

-- Redefines the SAME trigger function migrations 0004/0016 already
-- redefine (create-or-replace, not a new trigger — on_auth_user_created
-- still points at this one function name). Keeps every existing line from
-- 0016 (referral_code generation + the GBP referral_credit wallet
-- insert) and adds the new Flippy Coin friend-invite mechanic alongside it.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  new_code text := upper(substr(replace(new.id::text, '-', ''), 1, 8));
  incoming_code text := new.raw_user_meta_data->>'referral_code';
  referrer_id uuid;
  reward_gbp numeric := 5.00;
  v_friend_name text := new.raw_user_meta_data->>'friend_name';
  v_friend_email text := new.raw_user_meta_data->>'friend_email';
  v_matched_invite record;
begin
  if incoming_code is not null then
    select id into referrer_id from public.profiles where referral_code = incoming_code;
  end if;

  insert into public.profiles (id, display_name, referral_code, referred_by)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    new_code,
    referrer_id
  );

  -- Wallet credit for both sides, immediately — Steven's confirmed answer,
  -- untouched from migration 0016.
  if referrer_id is not null then
    insert into public.wallet_transactions (profile_id, amount_gbp, kind) values
      (referrer_id, reward_gbp, 'referral_credit'),
      (new.id, reward_gbp, 'referral_credit');
  end if;

  -- 18 Sept 2026 — Part 1, first half: "give them an extra 5 coins for the
  -- effort" of naming a friend at signup. Only fires when both fields were
  -- actually filled in (see app/signup/page.tsx) and the friend's email
  -- isn't just their own (a basic self-referral guard — the form itself
  -- also blocks this client-side).
  if v_friend_name is not null and trim(v_friend_name) <> '' and v_friend_email is not null and trim(v_friend_email) <> ''
     and lower(trim(v_friend_email)) <> lower(new.email) then
    insert into public.friend_invites (inviter_id, friend_name, friend_email)
    values (new.id, trim(v_friend_name), lower(trim(v_friend_email)));

    perform credit_flippy_coins(new.id, 5, 'bonus', null, 'Invited a friend at signup: ' || trim(v_friend_name));
  end if;

  -- 18 Sept 2026 — Part 1, second half: "when their friend signs up they
  -- both get 15 coins each." This new signup (new.email) might BE someone
  -- else's previously-invited friend — match the oldest still-pending
  -- invite for this email (first-inviter-wins if more than one person
  -- happened to invite the same address) and pay both sides.
  select * into v_matched_invite
    from public.friend_invites
    where status = 'pending' and lower(friend_email) = lower(new.email)
    order by created_at asc
    limit 1;

  if v_matched_invite.id is not null then
    update public.friend_invites
      set status = 'fulfilled', fulfilled_by = new.id, fulfilled_at = now()
      where id = v_matched_invite.id;

    perform credit_flippy_coins(v_matched_invite.inviter_id, 15, 'bonus', null, 'Your invited friend signed up');
    perform credit_flippy_coins(new.id, 15, 'bonus', null, 'Signed up via a friend''s invite');
  end if;

  return new;
end;
$$;

-- ============================================================
-- Part 2 — fixed-price, limited-allocation deals, replacing bidding /
-- instant-win going forward.
-- ============================================================
--
-- Reuses the EXISTING opportunities table rather than a parallel one — it's
-- the same underlying concept (pay for the exclusive right to source and
-- resell a verified deal), just fixed-price instead of auctioned, and
-- multiple people can each hold their own slot on the same deal instead of
-- exactly one winner. This keeps discoverOpportunities.ts's dedup/learning
-- signal, autoListWonOpportunity, buyback_policies' opportunity_id FK, and
-- listings.opportunity_id all working unchanged.
--
-- Existing 'auction' rows (already live before this migration) keep
-- working exactly as before via the untouched bid/instant-win routes —
-- nothing here retroactively converts them. Every NEW opportunity
-- discoverOpportunities.ts creates from this point on is 'fixed_price'.
alter table opportunities add column if not exists pricing_mode text not null default 'auction' check (pricing_mode in ('auction', 'fixed_price'));
alter table opportunities add column if not exists fixed_price_coins integer check (fixed_price_coins is null or fixed_price_coins > 0);

-- 'sold_out': every slot in the current batch has a buyer, but (unlike a
-- single-winner auction's 'won') the deal itself isn't finished — a real
-- sell-through-driven next batch (see evaluateBatchRelisting.ts) can still
-- reopen it by raising estimated_stock_units and flipping this back to
-- 'live'. Postgres 12+ supports adding an enum value without a full rewrite.
alter type opportunity_status add value if not exists 'sold_out';

-- One row per person who's claimed a slot on a fixed-price deal — the
-- multi-buyer equivalent of opportunities.won_by (which only ever holds
-- one uuid, so it can't represent "10 different people each won this").
-- estimated_stock_units on the parent opportunities row is the running
-- total ever released (starts at the first batch size, grows when
-- evaluateBatchRelisting.ts opens another); slots taken = count(*) here.
create table opportunity_slot_purchases (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  profile_id uuid not null references profiles(id),
  price_coins integer not null,
  batch_number integer not null default 1,
  purchased_at timestamptz not null default now(),
  -- One slot per person per deal — matches "offering to one person" per
  -- slot; buying a second slot on the SAME deal isn't a thing here (unlike
  -- the old instant-win's quantity picker, which fixed-price deals drop).
  unique (opportunity_id, profile_id)
);

create index idx_opportunity_slot_purchases_opportunity on opportunity_slot_purchases(opportunity_id);
create index idx_opportunity_slot_purchases_profile on opportunity_slot_purchases(profile_id);

alter table opportunity_slot_purchases enable row level security;
create policy "slot purchases are self-readable" on opportunity_slot_purchases for select using (auth.uid() = profile_id);
-- No insert policy for authenticated users — every row is written inside
-- buy_deal_slot() below (SECURITY DEFINER), which does the capacity check,
-- the coin debit, and this insert as one atomic unit under a row lock on
-- the parent opportunity — never a direct client insert.

-- The one sanctioned way to buy a slot on a fixed-price deal. `for update`
-- row-locks the opportunity for the duration of this transaction, so two
-- concurrent buyers of the same last slot are serialized rather than both
-- reading "1 slot left" and both succeeding (the same overselling bug class
-- migration 0011/0013's comments already flag for other optimistic-update
-- paths in this codebase — this one gets a real lock instead since coins
-- are actually changing hands here).
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
  if p_profile_id <> auth.uid() then
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

  -- Debit coins — raises on insufficient balance via
  -- profiles_flippy_coin_balance_non_negative (migration 0031), which
  -- rolls back this whole function, so no slot is ever taken without
  -- payment actually clearing.
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
grant execute on function buy_deal_slot(uuid, uuid) to authenticated;

-- ============================================================
-- Part 3 — post-sale social-share coin reward.
-- ============================================================
-- One flag per order marking whether the seller has already claimed the
-- share reward for that specific sale — see api/orders/[id]/share-reward.
alter table orders add column if not exists profit_share_reward_claimed_at timestamptz;
