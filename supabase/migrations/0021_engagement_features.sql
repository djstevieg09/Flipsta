-- 0021: engagement & retention round — loyalty credit, product reviews,
-- and deal-drop notification bookkeeping.
--
-- 27 Aug 2026, Steven: "go away and look at proven selling techniques that
-- will encorage a user to purhase from a site and also what makes it
-- almost addictive to keep coming back." Researched (real sources — see
-- claude/deployment-checklist.md's #-5 section) and scoped via
-- AskUserQuestion into four pieces; Steven picked all four. Three needed
-- schema (this file); the fourth — real low-stock badges — needed none,
-- since shop_items already tracks real per-unit stock (see 0013).

-- ------------------------------------------------------------------
-- 1. Loyalty credit — reuses the EXISTING wallet ledger rather than a new
-- points table, per Steven's confirmed answer ("buy something, get a small
-- % back as wallet credit, spend it like cash next time"). Just needs a
-- new `kind` value on the check constraint 0001_init.sql already defined.
-- ------------------------------------------------------------------
alter table wallet_transactions drop constraint wallet_transactions_kind_check;
alter table wallet_transactions add constraint wallet_transactions_kind_check
  check (kind in ('payout', 'commission', 'auction_fee', 'insurance_premium', 'referral_credit', 'buyback_payout', 'loyalty_credit'));

-- ------------------------------------------------------------------
-- 2. Product reviews — Steven confirmed "verified purchasers only".
--
-- Real discovery while building this: a `reviews` table already exists
-- (0002_admin_ops.sql, Section 12.4 "Reviews & Seller Ratings") AND a full
-- GET/POST /api/reviews already exists (apps/web/app/api/reviews/route.ts)
-- — buyer rates the SELLER on a completed peer-marketplace order. It was
-- fully built but never wired into any page, so nobody could see or use
-- it. This round finally surfaces it in the UI (Portfolio — see the web
-- zip) rather than rebuilding it.
--
-- That table only fits the peer marketplace though — order_id is a unique
-- not-null FK, and shop_items/opportunities purchases have no peer
-- "seller" to rate at all (shop_items deliberately hides the fulfiller's
-- identity from the buyer — see 0013 — and an opportunity is sourced by
-- Flipsta itself, not a person). Since tonight's actual ask was a
-- product/deal trust signal ("what makes someone buy" — reviews on shop
-- items specifically was the example given), this is a NEW, separate
-- table for exactly those two purchase types — same relationship as
-- buyer_wants vs buy_requests (migration 0020): related concepts,
-- deliberately separate mechanisms, no reason to force one to do both
-- jobs or to bend the seller-rating table's shape to fit a sourcing model
-- it was never designed for.
--
-- source_id is NOT a foreign key on purpose: it points at one of two
-- different tables depending on source_type, and Postgres can't express a
-- conditional FK. Application code (apps/web/app/api/product-reviews/route.ts)
-- verifies the reviewer actually owns a completed purchase matching
-- (source_type, source_id) — by querying that specific table filtered to
-- their own profile_id using their own request-scoped (RLS-respecting)
-- Supabase client — same "check ownership in app code, not a single
-- one-size-fits-all RLS policy" pattern migration 0020 already established
-- for buy_requests.
create table product_reviews (
  id uuid primary key default gen_random_uuid(),
  reviewer_id uuid not null references profiles(id) on delete cascade,
  source_type text not null check (source_type in ('shop_item', 'opportunity')),
  source_id uuid not null,
  product_name text not null,
  rating smallint not null check (rating between 1 and 5),
  body text,
  created_at timestamptz not null default now(),
  -- One review per purchase, not per product — buy the same product twice,
  -- review it twice.
  unique (reviewer_id, source_type, source_id)
);

create index idx_product_reviews_product_name on product_reviews(product_name);

alter table product_reviews enable row level security;

-- Publicly readable — the whole point is to be a trust signal other
-- shoppers see before buying, same reasoning shop_items/listings are
-- publicly readable for.
create policy "product reviews are publicly readable" on product_reviews for select using (true);

create policy "users write their own product reviews" on product_reviews
  for insert with check (reviewer_id = auth.uid());

create policy "users edit their own product reviews" on product_reviews
  for update using (reviewer_id = auth.uid()) with check (reviewer_id = auth.uid());

create policy "users delete their own product reviews" on product_reviews
  for delete using (reviewer_id = auth.uid());

-- ------------------------------------------------------------------
-- 3. Deal-drop notifications — Steven confirmed email via Resend. The
-- Resend wrapper (originally apps/web/lib/notifications.ts, moved to
-- packages/shared this round so apps/worker can use it too — see the
-- worker zip) already existed but was never wired to anything real beyond
-- a ticket-update stub; this is its first genuine use.
--
-- notify_deal_matches lets someone turn this off from /account without
-- contacting support — matters given the CMA/ICO scrutiny on making
-- opt-out harder than opt-in (see the research write-up): on by default,
-- one click off, nothing hidden behind a support ticket or a "are you
-- sure" maze.
alter table profiles add column if not exists notify_deal_matches boolean not null default true;

-- Records which (profile, shop_item) deal-match emails have already gone
-- out, so the periodic worker job never emails the same person about the
-- same item twice even if it runs again before the item sells. Internal
-- bookkeeping only — no policy for "authenticated", same staff/service-role-
-- only pattern as discovery_focus/seasonal_events (0019) and buy_requests'
-- admin-only columns (0020).
create table notification_log (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  shop_item_id uuid not null references shop_items(id) on delete cascade,
  kind text not null default 'deal_match',
  sent_at timestamptz not null default now(),
  unique (profile_id, shop_item_id, kind)
);

create index idx_notification_log_shop_item on notification_log(shop_item_id);

alter table notification_log enable row level security;
