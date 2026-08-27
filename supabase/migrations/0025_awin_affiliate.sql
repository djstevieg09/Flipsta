-- 0025: Awin affiliate integration — a genuinely separate revenue stream
-- from Flipsta's core arbitrage business.
--
-- 27 Aug 2026, Steven: "i need assistance setting up Awin api to fill my
-- store with goods" -> scoped via clarifying questions to: (1) a new
-- affiliate section — products stay on the merchant's own site, a shopper
-- clicks through and buys there, Flipsta earns a commission via Awin's
-- tracking, no Flipsta payment/shipping/fulfillment involved at all; and
-- (2) feed that same real product/price data into the AI discovery engine
-- as a search-quality signal. Steven's own words: "this is seperate from
-- our core buisness. then you can use this info to help search better."
--
-- Deliberately its own two tables, not reusing shop_items or products:
-- shop_items/products/listings all assume Flipsta or one of its resellers
-- physically holds and ships the item (see api/shop-items/[id]/
-- confirm-delivery, escrow release, fulfillment claims) — none of that
-- applies here. Mixing an affiliate-redirect row into that model would
-- make Flipsta look like it's selling something it never stocks.

-- Admin-managed pilot list of which Awin merchant programmes actually get
-- synced. Steven's explicit scope for the first pass: "Small pilot — 2-3
-- merchants first" — this table is what makes that a deliberate, visible
-- choice on the admin page rather than "sync everything I'm approved for"
-- by default. No hard cap enforced here — the pilot-size decision is an
-- operational one for the admin page's copy to guide, not something worth
-- hardcoding as a database constraint that would need a migration to lift.
create table awin_sync_config (
  id uuid primary key default gen_random_uuid(),
  -- Awin's own merchant/programme id (an integer in their API, stored as
  -- text here since nothing here does arithmetic on it and every other
  -- external-id column in this schema — source_retailer, channel keys —
  -- is text for the same reason: it's an opaque identifier, not a number).
  advertiser_id text not null unique,
  advertiser_name text not null,
  -- Optional default category mapping so synced products land somewhere
  -- sensible on /partner-deals without needing a per-product category
  -- guess — nullable because a merchant's feed may span more than one of
  -- Flipsta's own categories and "uncategorised" is a fine fallback.
  category_id uuid references categories(id),
  active boolean not null default true,
  added_by uuid references profiles(id),
  added_at timestamptz not null default now()
);

-- The synced products themselves. "network" is deliberately not a fixed
-- enum of one value — Steven's own framing was "a similar api" in general,
-- so if a second affiliate network is ever added later it slots into this
-- same table rather than needing a parallel schema.
create table affiliate_products (
  id uuid primary key default gen_random_uuid(),
  network text not null default 'awin' check (network in ('awin')),
  advertiser_id text not null,
  advertiser_name text not null,
  -- Awin's own per-product id within that advertiser's feed (their
  -- aw_product_id column) — the natural external key for upsert-on-sync.
  external_product_id text not null,
  title text not null,
  description text,
  image_url text,
  category_id uuid references categories(id),
  price_gbp numeric,
  rrp_gbp numeric,
  in_stock boolean not null default true,
  -- Awin's tracked deep link (their aw_deep_link column) — this is what
  -- actually earns the commission; never link straight to the merchant's
  -- plain product URL instead of this.
  affiliate_url text not null,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (network, advertiser_id, external_product_id)
);

create index idx_affiliate_products_category on affiliate_products(category_id) where in_stock = true;
create index idx_affiliate_products_advertiser on affiliate_products(network, advertiser_id);

alter table awin_sync_config enable row level security;

-- Staff-only, same pattern as discovery_focus/seasonal_events (0019) and
-- partners/risk_flags/admin_audit_log (0002_admin_ops.sql): RLS is on, but
-- deliberately no policy is granted to the "authenticated" role, so only
-- the service-role client (used by the sync job and the admin API route,
-- after requireStaff("admin") checks the caller's role in the application
-- layer) can read or write this table at all.

-- affiliate_products is the opposite — public read, same discipline as
-- categories (0015) and the opportunities teaser policy: browsing
-- /partner-deals needs no sign-in, same as /shop. Nothing here is ever
-- written by a client directly; only the sync job's service-role client
-- writes to it.
alter table affiliate_products enable row level security;
create policy "affiliate products are publicly readable" on affiliate_products for select using (true);
