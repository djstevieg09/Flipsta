-- 18 Sept 2026, Steven: "now i need you to find a way to add ali express
-- products and add them into our shop with a 25% markup and when someone
-- orders it then a dropship order is created." Followed by a clarifying
-- question on who fulfils — Steven's answer: "Just you / staff."
--
-- Real research this session (AliExpress's own Affiliate/Dropshipping
-- APIs, and DSers' own official help docs — DSers being the
-- AliExpress-sanctioned dropshipping tool) confirmed two hard constraints
-- that shape this schema:
--   1. Paying AliExpress for an order can never be automated, even by
--      DSers itself — a human has to go to AliExpress's own checkout and
--      click pay. So "staff places the AliExpress order by hand" isn't a
--      shortcut being taken here, it's how every dropshipping tool that
--      touches AliExpress actually works.
--   2. AliExpress's Affiliate API has no reliable way to pull full product
--      descriptions, and the Dropshipping/Business API needs its own
--      separate developer-portal signup + approval (1-2 business days,
--      geographic restrictions) — the same kind of external gate Steven
--      already hit with eBay/Etsy. Rather than block this feature on that
--      approval, products are admin-entered here (paste the AliExpress
--      product URL + fill in title/price/photo) — see
--      api/admin/dropship-products/route.ts. An automated feed-sync job
--      (mirroring syncAwinProducts.ts) can slot in later once/if Steven
--      gets that approval, without changing this table's shape.
--
-- Deliberately its own two tables, not shop_items (0013's crowd-fulfilled-
-- by-a-reseller model — wrong shape here, Steven fulfils these himself)
-- or affiliate_products (0025 — that's click-through-and-buy-elsewhere,
-- Flipsta takes no payment; this is the opposite: Flipsta takes payment
-- and the order must be fulfilled). Structurally this mirrors
-- merch_orders (0032) instead — Flipsta-fulfilled, Stripe Checkout with a
-- real shipping address — plus the two extra fields (ali_order_id,
-- tracking_number) staff fills in as they actually place and track the
-- AliExpress order.

create table dropship_products (
  id uuid primary key default gen_random_uuid(),
  -- The AliExpress product page URL staff copied in — also what staff
  -- opens again later to actually place the order once it's paid for.
  ali_product_url text not null,
  title text not null,
  description text,
  image_url text,
  -- What AliExpress charges today, entered by staff — the base this
  -- feature's 25% markup (packages/shared's DROPSHIP_MARKUP_MULTIPLIER)
  -- is calculated from. Kept even though it's not shown to buyers, since
  -- it's what tells staff how much they're fronting per order and lets a
  -- future re-price pick up AliExpress's current cost rather than a
  -- stale one.
  source_price_gbp numeric not null,
  -- Defaults to source_price_gbp * 1.25 (rounded) when a product is
  -- created, but stored (not computed on read) so staff can hand-adjust
  -- an individual item's price without it silently drifting back to the
  -- formula on the next edit.
  our_price_gbp numeric not null,
  category_id uuid references categories(id),
  is_active boolean not null default true,
  added_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_dropship_products_active on dropship_products(is_active) where is_active = true;

-- Mirrors merch_orders (0032) almost exactly — see that migration's own
-- comment for why every field's there. The two genuinely new fields:
-- ali_order_id / tracking_number, filled in by staff as they actually go
-- and place + track the order on AliExpress (see
-- api/admin/dropship-orders/route.ts) — nothing here is ever written by
-- a client directly except the initial row, which only the Stripe webhook
-- inserts once payment is actually confirmed.
create table dropship_orders (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  dropship_product_id uuid references dropship_products(id),
  -- Snapshotted at purchase time, same reasoning as merch_orders.item_name
  -- — a product can be edited or deactivated later without corrupting the
  -- historical order record.
  product_title text not null,
  product_image_url text,
  quantity integer not null default 1,
  price_gbp numeric not null,
  shipping_gbp numeric not null default 0,
  shipping_name text,
  shipping_address jsonb,
  stripe_checkout_session_id text unique not null,
  -- pending: paid, not yet ordered on AliExpress. ordered: staff has paid
  -- AliExpress and (optionally) recorded ali_order_id. shipped: tracking
  -- added. cancelled: refunded/void — same shape as merch_orders' status
  -- check, plus the extra "ordered" step this workflow actually needs.
  status text not null default 'pending' check (status in ('pending', 'ordered', 'shipped', 'cancelled')),
  ali_order_id text,
  tracking_number text,
  ordered_at timestamptz,
  shipped_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_dropship_orders_profile_id on dropship_orders(profile_id);

alter table dropship_products enable row level security;
-- Public read, same as affiliate_products/categories — browsing /shop
-- needs no sign-in. Only ever written by the admin route's service-role
-- client (requireStaff-gated), so no insert/update policy for
-- "authenticated" is needed or granted.
create policy "dropship products are publicly readable" on dropship_products for select using (is_active = true);

alter table dropship_orders enable row level security;
create policy "dropship orders are self-readable" on dropship_orders for select using (auth.uid() = profile_id);
-- No insert/update policy for authenticated users on purpose — same as
-- merch_orders: every row is written by the Stripe webhook (service-role)
-- once payment is confirmed, and only the admin dropship-orders route
-- (also service-role) updates status/ali_order_id/tracking_number.
