-- 0016: referral program.
--
-- 26 Aug 2026, Steven: "we need a referral program." Confirmed via a
-- clarifying question: wallet credit for BOTH the referrer and the new
-- signup, paid immediately on signup (not gated behind a first purchase).
-- £5 each — a first-pass number (kept in sync with
-- packages/shared/src/constants.ts's REFERRAL_REWARD_GBP for display),
-- easy to tune later; revisit once real signup volume shows whether it's
-- too generous or too stingy.
--
-- referral_code is generated deterministically from each profile's own id
-- (uppercase hex of its first 8 chars with dashes stripped) rather than
-- randomly generated then checked for collisions — since id is already
-- guaranteed unique, so is this, with zero collision-retry logic needed.

alter table profiles add column if not exists referral_code text;
alter table profiles add column if not exists referred_by uuid references profiles(id);

update profiles set referral_code = upper(substr(replace(id::text, '-', ''), 1, 8)) where referral_code is null;

alter table profiles alter column referral_code set not null;
alter table profiles add constraint profiles_referral_code_key unique (referral_code);

create index idx_profiles_referred_by on profiles(referred_by);

-- Redefines the signup trigger originally created in
-- 0004_auth_profile_trigger.sql — that file is never edited once live (it's
-- long since applied in production), so this is a NEW migration replacing
-- the function body via create-or-replace, not a change to that file. The
-- trigger itself (on_auth_user_created) still points at this same function
-- name, so nothing else needs re-wiring.
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

  -- Wallet credit for both sides, immediately — Steven's confirmed answer.
  -- balanceGBP everywhere in this app (see GET /api/wallet) is just
  -- SUM(amount_gbp) over wallet_transactions, so inserting these two rows
  -- IS the credit; no separate balance column to keep in sync.
  if referrer_id is not null then
    insert into public.wallet_transactions (profile_id, amount_gbp, kind) values
      (referrer_id, reward_gbp, 'referral_credit'),
      (new.id, reward_gbp, 'referral_credit');
  end if;

  return new;
end;
$$;
