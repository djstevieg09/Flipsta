-- 18 Sept 2026, Steven: "need to get the coins working with the wallet
-- amount showing in the top right hand corner... so get the flippy coins
-- shop all working." Real money buys these (Stripe Checkout, see
-- lib/stripe.ts's createCoinCheckoutSession and the webhook handler), so
-- the balance needs to be tamper-proof from the client side, not just a
-- plain column the existing "profiles are self-updatable" RLS policy
-- would otherwise let anyone PATCH directly via the Supabase REST API
-- using their own session (that policy has no column restriction — it's
-- pre-existing and out of scope to redesign here, but a mintable-currency
-- column can't be left exposed through it).
--
-- Deliberately a NEW balance + ledger, not a rework of the existing GBP
-- wallet_transactions table — planning/coin-economy-proposal.md proposes
-- eventually converting the whole wallet (loyalty/referral/goodwill
-- credit) to Flippy Coins, but that's still an open decision with real
-- live-money code involved and wasn't part of this ask. This is additive
-- and leaves wallet_transactions/GBP untouched.
alter table profiles add column if not exists flippy_coin_balance integer not null default 0;
alter table profiles add constraint profiles_flippy_coin_balance_non_negative check (flippy_coin_balance >= 0);

create table if not exists coin_transactions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  amount integer not null,
  kind text not null check (kind in ('purchase', 'bonus', 'admin_grant', 'refund', 'spend')),
  -- Set only for Stripe-originated credits (kind = 'purchase') — the
  -- unique constraint is what makes crediting idempotent if Stripe ever
  -- redelivers the same checkout.session.completed webhook event.
  stripe_checkout_session_id text unique,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists coin_transactions_profile_id_idx on coin_transactions (profile_id);

alter table coin_transactions enable row level security;
create policy "coin transactions are self-readable" on coin_transactions for select using (auth.uid() = profile_id);
-- No insert/update/delete policy for authenticated users on purpose —
-- every row is written server-side via credit_flippy_coins() below
-- (SECURITY DEFINER, owner-privileged), never directly by a client.

-- Guards flippy_coin_balance specifically against the same "profiles are
-- self-updatable" RLS gap that already lets any signed-in user PATCH
-- their own profile row's columns directly through Supabase's REST API —
-- credit_flippy_coins() is the only path allowed to move this number.
create or replace function prevent_direct_coin_balance_change() returns trigger
language plpgsql as $$
begin
  if new.flippy_coin_balance is distinct from old.flippy_coin_balance then
    if coalesce(current_setting('flipsta.allow_coin_balance_change', true), 'false') <> 'true' then
      raise exception 'flippy_coin_balance can only be changed via credit_flippy_coins()';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_coin_balance on profiles;
create trigger profiles_protect_coin_balance
  before update on profiles
  for each row execute function prevent_direct_coin_balance_change();

-- The only sanctioned way to move flippy_coin_balance. Idempotent on
-- p_stripe_checkout_session_id (via coin_transactions' unique constraint
-- + ON CONFLICT DO NOTHING) so a redelivered Stripe webhook event can
-- never double-credit a purchase. SECURITY DEFINER + owned by the
-- migration role (the profiles/coin_transactions table owner) so it can
-- write both tables regardless of RLS; EXECUTE is revoked from
-- PUBLIC/authenticated below and granted only to service_role, since
-- nothing here re-checks that the caller is allowed to credit
-- p_profile_id — only server code using the service-role client
-- (the Stripe webhook, an admin route) may call this.
create or replace function credit_flippy_coins(
  p_profile_id uuid,
  p_amount integer,
  p_kind text,
  p_stripe_checkout_session_id text default null,
  p_note text default null
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_balance integer;
  v_credited boolean := true;
begin
  if p_stripe_checkout_session_id is not null then
    insert into coin_transactions (profile_id, amount, kind, stripe_checkout_session_id, note)
    values (p_profile_id, p_amount, p_kind, p_stripe_checkout_session_id, p_note)
    on conflict (stripe_checkout_session_id) do nothing;
    if not found then
      v_credited := false;
    end if;
  else
    insert into coin_transactions (profile_id, amount, kind, note)
    values (p_profile_id, p_amount, p_kind, p_note);
  end if;

  if v_credited then
    perform set_config('flipsta.allow_coin_balance_change', 'true', true);
    update profiles set flippy_coin_balance = flippy_coin_balance + p_amount where id = p_profile_id
      returning flippy_coin_balance into v_new_balance;
  else
    select flippy_coin_balance into v_new_balance from profiles where id = p_profile_id;
  end if;

  return v_new_balance;
end;
$$;

revoke execute on function credit_flippy_coins(uuid, integer, text, text, text) from public;
grant execute on function credit_flippy_coins(uuid, integer, text, text, text) to service_role;
