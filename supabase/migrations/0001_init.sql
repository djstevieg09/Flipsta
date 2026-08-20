-- Flipsta initial schema
-- Implements the mechanics documented in planning/exchange-concept-explainer.md
-- Run via: supabase db push  (see INFRASTRUCTURE_TODO.md)

create extension if not exists "pgcrypto";

-- ============================================================
-- Profiles & subscriptions (Section 7)
-- ============================================================
create type subscription_tier as enum ('free', 'standard', 'pro', 'elite');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  subscription_tier subscription_tier not null default 'free',
  stripe_customer_id text,
  stripe_connect_account_id text, -- Stripe Connect (Section 6) for sellers receiving payouts
  referral_code text unique not null default substr(md5(random()::text), 1, 8),
  referred_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table trade_sellers (
  -- Section 11.5 — distributors/wholesalers, no subscription, volume-tiered commission
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  business_name text not null,
  verified boolean not null default false,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Categories & the public Flip Index (Section 6.1)
-- ============================================================
create table categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique
);

create table flip_index_snapshots (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references categories(id),
  week_start date not null,
  score numeric not null check (score >= 0 and score <= 100),
  unique (category_id, week_start)
);

-- ============================================================
-- Opportunities & the auction engine (Sections 2, 5, 11.1-11.3)
-- ============================================================
create type urgency_tier as enum ('hot', 'standard', 'stable');
create type opportunity_status as enum ('draft', 'live', 'won', 'lapsed', 'cancelled');

create table opportunities (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references categories(id),
  source_tier text not null,               -- redacted teaser field, e.g. "Major UK high-street clearance"
  source_retailer text,                    -- withheld from teaser, revealed on win (Section 5)
  source_url text,                         -- withheld from teaser, revealed on win
  source_price_gbp numeric,                -- withheld from teaser, revealed on win
  margin_band_low numeric not null,
  margin_band_high numeric not null,
  expected_margin_gbp numeric not null,
  confidence_score numeric not null check (confidence_score >= 0 and confidence_score <= 1),
  urgency_tier urgency_tier not null,
  action_clock_seconds integer not null,
  estimated_stock_units integer not null,
  per_customer_cap integer,
  batch_number integer not null default 1, -- Section 11.2 batch relisting
  starting_bid_gbp numeric not null,
  instant_win_price_gbp numeric not null,
  status opportunity_status not null default 'draft',
  live_at timestamptz,                     -- when it entered the public feed
  pro_early_access_until timestamptz,      -- Section 7 — Pro/Elite early access window
  action_clock_expires_at timestamptz,     -- set once someone wins
  won_by uuid references profiles(id),
  ai_reasoning text,                       -- Section 11's "why" explainability (Pro/Elite only, gated in API layer)
  created_at timestamptz not null default now()
);

create index idx_opportunities_status on opportunities(status);
create index idx_opportunities_category on opportunities(category_id);

create table bids (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  bidder_id uuid not null references profiles(id),
  amount_gbp numeric not null,
  is_instant_win boolean not null default false,
  placed_by_sniper boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_bids_opportunity on bids(opportunity_id, amount_gbp desc);

create table sniper_rules (
  -- Section 6.1 / 7 — Pro+ automatic bidding
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  category_id uuid references categories(id), -- null = all categories
  max_budget_gbp numeric not null,
  min_margin_pct numeric not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Syndicates (Elite feature — Section 6.1, 7)
-- ============================================================
create table syndicates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  leader_id uuid not null references profiles(id),
  target_opportunity_id uuid references opportunities(id),
  created_at timestamptz not null default now()
);

create table syndicate_members (
  syndicate_id uuid not null references syndicates(id) on delete cascade,
  profile_id uuid not null references profiles(id),
  contributed_gbp numeric not null default 0,
  primary key (syndicate_id, profile_id)
);

-- ============================================================
-- Buyer Wants (Section 11.10 — demand-pull, reverse auction)
-- ============================================================
create table buyer_wants (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references profiles(id),
  item_description text not null,
  condition_notes text,
  max_price_gbp numeric not null,
  closes_at timestamptz,
  fulfilled_offer_id uuid,
  created_at timestamptz not null default now()
);

create table want_offers (
  id uuid primary key default gen_random_uuid(),
  want_id uuid not null references buyer_wants(id) on delete cascade,
  seller_id uuid not null references profiles(id),
  offer_price_gbp numeric not null,
  created_at timestamptz not null default now()
);

alter table buyer_wants
  add constraint fk_fulfilled_offer foreign key (fulfilled_offer_id) references want_offers(id);

-- ============================================================
-- Marketplace listings — pooled order book (Section 11.4)
-- ============================================================
create table products (
  -- canonical product, so multiple sellers' listings pool onto one page
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references categories(id),
  title text not null,
  condition text not null,
  description text,
  created_at timestamptz not null default now()
);

create table listings (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  seller_id uuid not null references profiles(id),
  price_gbp numeric not null check (price_gbp > 0),
  sell_type text not null default 'market' check (sell_type in ('market', 'limit')),
  min_margin_pct numeric,             -- Section 11.8 limit-sell
  quantity integer not null default 1,
  listed_at timestamptz not null default now(),
  sold_at timestamptz
);

create index idx_listings_product_price on listings(product_id, price_gbp, listed_at) where sold_at is null;

-- ============================================================
-- Orders, escrow & payments (Section 6 — Stripe Connect, held until delivery)
-- ============================================================
create type order_status as enum ('pending_payment', 'preparing', 'shipped', 'delivered', 'refunded', 'disputed');

create table orders (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references profiles(id),
  listing_id uuid not null references listings(id),
  price_gbp numeric not null,
  commission_gbp numeric not null,
  courier text,                      -- 'dpd' | 'evri' (Section 10.1 / 11.9)
  shipping_gbp numeric not null default 0,
  status order_status not null default 'pending_payment',
  extended_hold_requested boolean not null default false, -- seller's optional 2-week hold
  stripe_payment_intent_id text,
  funds_released_at timestamptz,     -- null until Stripe Connect transfer to seller fires
  created_at timestamptz not null default now()
);

create index idx_orders_buyer on orders(buyer_id);
create index idx_orders_status on orders(status);

-- ============================================================
-- Buyback guarantee (Section 8.3, 11.6)
-- ============================================================
create table buyback_policies (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id),
  premium_gbp numeric not null,
  failure_probability numeric not null,
  payout_pct numeric not null default 0.7,
  purchased_at timestamptz not null default now()
);

create type buyback_claim_status as enum ('pending_window', 'eligible', 'paid', 'rejected');

create table buyback_claims (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references buyback_policies(id),
  status buyback_claim_status not null default 'pending_window',
  listed_at_or_below_estimate boolean not null default false,
  offered_at_cost_after_window boolean not null default false,
  filed_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- ============================================================
-- Wallet ledger (Section 9 financial model, Section 6 escrow)
-- ============================================================
create table wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id),
  amount_gbp numeric not null, -- positive = credit, negative = debit
  kind text not null check (kind in ('payout', 'commission', 'auction_fee', 'insurance_premium', 'referral_credit', 'buyback_payout')),
  reference_order_id uuid references orders(id),
  reference_opportunity_id uuid references opportunities(id),
  created_at timestamptz not null default now()
);

create index idx_wallet_profile on wallet_transactions(profile_id, created_at desc);

-- ============================================================
-- AI discovery pipeline audit trail (Section 2, worker-populated)
-- ============================================================
create table discovery_runs (
  id uuid primary key default gen_random_uuid(),
  source_adapter text not null,  -- e.g. 'mock', 'keepa' (Section 9.1)
  candidates_found integer not null default 0,
  opportunities_created integer not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

-- ============================================================
-- Row Level Security
-- ============================================================
alter table profiles enable row level security;
alter table opportunities enable row level security;
alter table bids enable row level security;
alter table sniper_rules enable row level security;
alter table buyer_wants enable row level security;
alter table want_offers enable row level security;
alter table listings enable row level security;
alter table orders enable row level security;
alter table wallet_transactions enable row level security;
alter table buyback_policies enable row level security;
alter table buyback_claims enable row level security;

create policy "profiles are self-readable" on profiles for select using (auth.uid() = id);
create policy "profiles are self-updatable" on profiles for update using (auth.uid() = id);

-- Opportunities: teaser fields are visible to any authenticated Standard+ user;
-- the app layer (not RLS) strips source_retailer/source_url/source_price_gbp
-- from the teaser response until the viewer has won it — see apps/web/lib/opportunities.ts.
create policy "live opportunities are readable by authenticated users" on opportunities
  for select using (auth.role() = 'authenticated');

create policy "bids are readable by the bidder" on bids for select using (auth.uid() = bidder_id);
create policy "users can place their own bids" on bids for insert with check (auth.uid() = bidder_id);

create policy "sniper rules are owner-only" on sniper_rules for all using (auth.uid() = profile_id);

create policy "buyer wants are publicly readable" on buyer_wants for select using (true);
create policy "buyers manage their own wants" on buyer_wants for insert with check (auth.uid() = buyer_id);

create policy "want offers are publicly readable" on want_offers for select using (true);
create policy "sellers create their own want offers" on want_offers for insert with check (auth.uid() = seller_id);

create policy "listings are publicly readable" on listings for select using (true);
create policy "sellers manage their own listings" on listings for insert with check (auth.uid() = seller_id);

create policy "orders are readable by the buyer" on orders for select using (auth.uid() = buyer_id);
create policy "buyers create their own orders" on orders for insert with check (auth.uid() = buyer_id);

create policy "wallet transactions are self-readable" on wallet_transactions for select using (auth.uid() = profile_id);

create policy "buyback policies readable via owning order" on buyback_policies for select
  using (exists (select 1 from orders o where o.id = order_id and o.buyer_id = auth.uid()));
create policy "buyback claims readable via owning policy" on buyback_claims for select
  using (exists (
    select 1 from buyback_policies p join orders o on o.id = p.order_id
    where p.id = policy_id and o.buyer_id = auth.uid()
  ));

-- Tier-gated actions (sniper mode = Pro/Elite, syndicates = Elite) are enforced
-- in the API layer (apps/web/lib/tierGuard.ts) rather than RLS, since RLS
-- cannot see the "priority processing" / discount business rules cleanly —
-- RLS here only enforces row ownership, not subscription entitlements.
