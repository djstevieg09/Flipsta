-- 0013: Flipsta-sourced shop items + crowd fulfillment.
--
-- 26 Aug 2026, Steven: "when the bot does a search and finds an item that
-- has a good margin on it but rejects it as cannot find proof of selling
-- then i want it to capture all of the info... and post the item on our
-- shop." Today's own real candidates get discarded by claudeSearchAdapter.ts
-- whenever it can't find independent resale evidence — a real retailer
-- discount was found, the search credit was already spent, and it's just
-- thrown away. This is a second, DIFFERENT sourcing lane from the
-- reseller-opportunity one (see 0001's opportunities table): instead of a
-- reseller buying the right to go purchase and resell an item themselves,
-- FLIPSTA lists the item directly, sells it itself (anchored on the
-- retailer's own genuine RRP, since there's no independent resale check to
-- anchor on), and pays a Pro/Elite member a reward to actually go buy and
-- ship it once it sells. See packages/shared/src/shopPricing.ts for the
-- pricing/qualification math.
--
-- Money flow, per Steven: "the money does not get released until the item
-- has been delivered." Reuses the exact same manual-capture Stripe pattern
-- already built for the peer marketplace (apps/web/lib/stripe.ts) — the
-- buyer's card is authorized (held) at purchase time and only actually
-- captured once delivery is confirmed; the fulfiller's reimbursement +
-- reward is paid via a wallet_transactions credit at that same moment
-- (mirrors releaseEscrow.ts's existing seller-payout pattern exactly).
create type shop_item_status as enum (
  'available',
  'sold_awaiting_fulfillment',
  'fulfillment_claimed',
  'shipped',
  'delivered',
  'cancelled'
);

create table shop_items (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references categories(id),
  product_name text not null,
  description text,
  image_url text,
  source_retailer text not null,   -- kept internal — only ever shown to the fulfiller once they've claimed it
  source_url text not null,
  source_price_gbp numeric not null,
  rrp_gbp numeric not null,        -- the retailer's own genuine RRP — the one signal we have without independent resale proof
  our_price_gbp numeric not null,  -- the Buy Now price shown to customers
  min_offer_accept_gbp numeric not null, -- Make an Offer auto-accepts at or above this
  fulfillment_reward_gbp numeric not null, -- what the fulfiller earns on top of being reimbursed their outlay
  fulfiller_reimbursement_gbp numeric not null, -- source price + estimated shipping, locked in at listing time (shopPricing.ts)
  estimated_stock_units integer not null default 1,
  status shop_item_status not null default 'available',

  buyer_id uuid references profiles(id),
  sold_price_gbp numeric,          -- Buy Now price or the accepted offer, whichever actually happened
  stripe_payment_intent_id text,
  paid_at timestamptz,             -- when the buyer's card was authorized/held, NOT necessarily captured yet
  shipping_address jsonb,

  fulfiller_id uuid references profiles(id),
  fulfillment_claimed_at timestamptz,
  fulfillment_deadline_at timestamptz, -- past this with no shipment, the claim auto-releases (see releaseExpiredFulfillmentClaims.ts)
  shipped_at timestamptz,
  delivered_at timestamptz,
  funds_released_at timestamptz,   -- buyer's card actually captured + fulfiller's wallet credited, both at once

  created_at timestamptz not null default now()
);

create index idx_shop_items_status on shop_items(status);
create index idx_shop_items_fulfillment_deadline on shop_items(fulfillment_deadline_at) where status = 'fulfillment_claimed';

alter table shop_items enable row level security;

-- Public teaser: RRP/our_price/photo/description are the whole point of a
-- shop listing, so — unlike opportunities — nothing here needs redacting
-- at the RLS layer for an "available" item. source_retailer/source_url
-- ARE included in a plain select, but the app layer (api/shop-items)
-- strips them for anyone except the fulfiller who's claimed it — same
-- reveal-on-claim pattern as opportunities' reveal-on-win.
create policy "shop items are publicly readable" on shop_items for select using (true);

-- Buying/making an offer: only an available item, and only into the
-- 'sold_awaiting_fulfillment' state, only as yourself. (Same
-- unchecked-write lesson as migration 0011 — the API route must also
-- verify a row actually came back, not just trust a lack of error.)
create policy "signed-in users can buy an available shop item" on shop_items
  for update
  using (status = 'available')
  with check (status = 'sold_awaiting_fulfillment' and buyer_id = auth.uid());

-- Claiming a fulfillment job: only an unclaimed, paid-for item, only into
-- 'fulfillment_claimed', only as yourself. The per-user concurrent-claim
-- cap (Steven's fairness ask) is enforced in the API route, not here — RLS
-- can't easily count a user's other rows in one policy expression.
create policy "signed-in users can claim an open fulfillment job" on shop_items
  for update
  using (status = 'sold_awaiting_fulfillment' and fulfiller_id is null)
  with check (status = 'fulfillment_claimed' and fulfiller_id = auth.uid());

-- Marking your own claim shipped.
create policy "fulfiller can mark their own claim shipped" on shop_items
  for update
  using (status = 'fulfillment_claimed' and fulfiller_id = auth.uid())
  with check (status = 'shipped' and fulfiller_id = auth.uid());

-- The buyer confirming their own order arrived — this is what actually
-- triggers payment capture + fulfiller payout (done server-side in the
-- API route using the service-role client, not by this policy directly).
create policy "buyer can confirm their own delivery" on shop_items
  for update
  using (status = 'shipped' and buyer_id = auth.uid())
  with check (status = 'delivered' and buyer_id = auth.uid());

-- discoverOpportunities.ts now creates shop_items alongside opportunities in
-- the same run — track that count on the existing discovery_runs row rather
-- than adding a parallel table just for a count.
alter table discovery_runs add column if not exists shop_items_created integer not null default 0;

-- A fulfiller's reimbursement + reward is paid via the same wallet_transactions
-- ledger the peer marketplace already uses (releaseEscrow.ts), but
-- reference_order_id is a real FK to orders(id) — a shop_items row is a
-- different table, so it needs its own nullable reference column rather
-- than reusing that one incorrectly.
alter table wallet_transactions add column if not exists reference_shop_item_id uuid references shop_items(id);
