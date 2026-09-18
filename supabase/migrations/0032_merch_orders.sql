-- 18 Sept 2026, Steven: "need to add a merch tab on the main landing page
-- with tshirts, caps and other items that people can buy." Every paid
-- order (item, size, quantity, price, shipping address Stripe collected
-- at checkout) lands here once the Stripe webhook confirms payment — see
-- app/api/webhooks/stripe/route.ts and app/api/merch/checkout/route.ts.
-- This is the only way Steven can see what to actually ship, so it's not
-- optional scope: a checkout with nowhere for the order to land would
-- take real money with no way to fulfil it.
create table if not exists merch_orders (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  item_id text not null,
  item_name text not null,
  size text,
  quantity integer not null default 1,
  price_gbp numeric not null,
  shipping_gbp numeric not null default 0,
  shipping_name text,
  shipping_address jsonb,
  stripe_checkout_session_id text unique not null,
  status text not null default 'pending' check (status in ('pending', 'shipped', 'cancelled')),
  created_at timestamptz not null default now(),
  shipped_at timestamptz
);

create index if not exists merch_orders_profile_id_idx on merch_orders (profile_id);

alter table merch_orders enable row level security;
create policy "merch orders are self-readable" on merch_orders for select using (auth.uid() = profile_id);
-- No insert/update policy for authenticated users on purpose — every row
-- is written by the Stripe webhook (service-role client) once payment is
-- actually confirmed, and only the admin merch-orders route (also
-- service-role) updates its status.
