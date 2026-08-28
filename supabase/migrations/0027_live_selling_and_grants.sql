-- 27 Aug 2026, Steven: "i would like to be able to offer my resellers the
-- oppotunity to do live selling via my site... a bit like QVC... whatnot
-- does this already." + "we also need an oppotunity to issue a free months
-- subscription or mulitples of." + "have a leaderboard showing who is the
-- top seller by profit."
--
-- Four pieces of schema in one migration since they're all part of the same
-- round: live shows (video + real-time bidding + chat), the free-month
-- subscription grant mechanism, and what the leaderboard reads from (no new
-- table needed there — see api/leaderboard/route.ts, it's computed from
-- orders/listings/opportunities that already exist).

-- ============================================================
-- Live selling
-- ============================================================

-- A show is hosted by one reseller (any approved seller, per Steven's
-- confirmed answer: "Any approved reseller" rather than Flipsta-only), goes
-- through scheduled -> live -> ended (or cancelled before ever going live).
create table live_shows (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references profiles(id),
  title text not null,
  description text,
  status text not null default 'scheduled' check (status in ('scheduled', 'live', 'ended', 'cancelled')),
  scheduled_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  -- Cloudflare Stream (see apps/web/lib/cloudflareStream.ts) — the live
  -- input's own id and the playback-side identifiers, all safe to be
  -- publicly readable (needed for viewers to actually watch). The WHIP
  -- broadcast URL and stream key are NOT stored here — see
  -- live_show_stream_keys below, a deliberately separate, locked-down
  -- table, since this table has a public-read RLS policy.
  cf_live_input_uid text,
  cf_playback_uid text,
  peak_viewer_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index idx_live_shows_status on live_shows(status, scheduled_at);
create index idx_live_shows_host on live_shows(host_id);

-- Deliberately split from live_shows: the WHIP ingest URL is effectively a
-- broadcast credential (anyone who has it can stream video *as* the host),
-- so it must never be exposed by live_shows' public-read policy below. Only
-- the host (via a dedicated authenticated API route,
-- api/live-shows/[id]/stream-key) or staff can ever read it.
create table live_show_stream_keys (
  live_show_id uuid primary key references live_shows(id) on delete cascade,
  cf_whip_url text not null,
  created_at timestamptz not null default now()
);

-- One item queued into a show. Deliberately built from the reseller's own
-- EXISTING unsold listing (not an ad-hoc item typed in mid-stream) — this
-- means live selling reuses the whole existing listing/product model and,
-- critically, the existing checkout/escrow/commission machinery
-- (api/orders/route.ts, now factored out into lib/orderCreation.ts so both
-- a normal purchase and a live-show win create an order the identical way)
-- rather than a second, parallel, less-tested one. A future round could add
-- "create a new listing live" as a nicety; v1 requires listing it first.
create table live_show_items (
  id uuid primary key default gen_random_uuid(),
  live_show_id uuid not null references live_shows(id) on delete cascade,
  listing_id uuid not null references listings(id),
  position integer not null default 0,
  starting_bid_gbp numeric not null check (starting_bid_gbp > 0),
  -- Optional instant-buy price, sitting alongside the live auction — same
  -- "instant-win alongside the live auction, not instead of it" shape
  -- opportunities already use (Section 11.3), same reasoning: an impatient
  -- buyer shouldn't have to wait out the clock if they're happy to pay more.
  buy_now_price_gbp numeric check (buy_now_price_gbp is null or buy_now_price_gbp > starting_bid_gbp),
  status text not null default 'upcoming' check (status in ('upcoming', 'active', 'sold', 'unsold')),
  started_at timestamptz,
  ends_at timestamptz,
  winning_bid_gbp numeric,
  winner_id uuid references profiles(id),
  -- Set once settled (worker job or buy-now) actually creates the order —
  -- the same order a normal /api/orders purchase would create. Nullable:
  -- an 'unsold' item (no bids when the clock ran out) never gets one.
  order_id uuid references orders(id),
  created_at timestamptz not null default now(),
  unique (live_show_id, listing_id)
);

create index idx_live_show_items_show on live_show_items(live_show_id, position);
create index idx_live_show_items_active on live_show_items(status, ends_at) where status = 'active';

-- Public bid feed — deliberately NOT modelled like opportunities' `bids`
-- table (which is bidder-only readable, "anti-free-riding" secrecy for
-- arbitrage sourcing — see 0001_init.sql's RLS policy comment). A live show
-- is the opposite: watching the bid count climb in real time in front of
-- other viewers is the entire point, same as Whatnot/eBay Live/QVC. Public
-- SELECT here is deliberate, not an oversight.
create table live_bids (
  id uuid primary key default gen_random_uuid(),
  live_show_item_id uuid not null references live_show_items(id) on delete cascade,
  bidder_id uuid not null references profiles(id),
  amount_gbp numeric not null,
  created_at timestamptz not null default now()
);

create index idx_live_bids_item on live_bids(live_show_item_id, amount_gbp desc);

-- Live chat. Unlike bids/items (which go through an API route for real
-- business-logic validation), chat has none to enforce beyond "you can only
-- post as yourself" and a length cap, so this is designed for the browser
-- to insert directly via Supabase Realtime — see live/[id]/page.tsx. This
-- is the first table in the codebase actually built for direct
-- client-to-Supabase Realtime rather than going through a Next.js API
-- route; worth knowing that if extending this pattern elsewhere.
create table live_chat_messages (
  id uuid primary key default gen_random_uuid(),
  live_show_id uuid not null references live_shows(id) on delete cascade,
  profile_id uuid not null references profiles(id),
  message text not null check (char_length(message) between 1 and 500),
  created_at timestamptz not null default now()
);

create index idx_live_chat_show on live_chat_messages(live_show_id, created_at);

alter table live_shows enable row level security;
alter table live_show_stream_keys enable row level security;
alter table live_show_items enable row level security;
alter table live_bids enable row level security;
alter table live_chat_messages enable row level security;

-- live_shows / live_show_items / live_bids / live_chat_messages: public
-- SELECT so browsing /live and a show's real-time bid feed and chat all
-- work — none of these columns are sensitive (contrast live_show_stream_keys
-- below, which gets NO policy at all, matching the established
-- staff-only-via-service-role convention from awin_sync_config, 0025).
create policy "live shows are publicly readable" on live_shows for select using (true);
create policy "live show items are publicly readable" on live_show_items for select using (true);
create policy "live bids are publicly readable" on live_bids for select using (true);
create policy "live chat is publicly readable" on live_chat_messages for select using (true);

-- Writes: live_shows/live_show_items/live_bids all go through API routes
-- using the caller's own authenticated session (mirroring how
-- api/opportunities/[id]/bid/route.ts already works) plus real
-- business-logic checks (floor price, item/show status, tier) that don't
-- belong in an RLS policy — these insert/update policies are the same
-- "you can only act as yourself" backstop those routes already rely on,
-- not the primary validation.
create policy "hosts create their own shows" on live_shows for insert with check (auth.uid() = host_id);
create policy "hosts update their own shows" on live_shows for update using (auth.uid() = host_id);
create policy "hosts manage their own show items" on live_show_items for all using (
  auth.uid() = (select host_id from live_shows where id = live_show_id)
);
create policy "users place their own live bids" on live_bids for insert with check (auth.uid() = bidder_id);

-- Chat is the exception — direct client insert via Realtime, so this IS the
-- real (only) validation, not a backstop. The length cap above is the other
-- half of it.
create policy "users post their own chat messages" on live_chat_messages for insert with check (auth.uid() = profile_id);

-- live_show_stream_keys: RLS enabled, zero policies granted — same
-- established "staff-only via service-role" pattern as awin_sync_config
-- (0025_awin_affiliate.sql). The host retrieves their own key through
-- api/live-shows/[id]/stream-key, which uses the service-role client and
-- checks auth.uid() === host_id in application code, not RLS.

-- ============================================================
-- Free month(s) subscription grant
-- ============================================================

-- 27 Aug 2026, Steven: "we also need an oppotunity to issue a free months
-- subscription or mulitples of." Confirmed answer: a general admin gifting
-- tool (not specifically a live-show giveaway mechanic, though nothing
-- stops that being wired in later). Deliberately layered ON TOP of the
-- existing "Override -> Elite" tier-override button (admin/sellers/page.tsx,
-- api/admin/sellers/[id]/route.ts) rather than replacing it — that one is a
-- permanent, no-expiry override; this adds an auto-expiring version by
-- remembering what subscription_tier was right before the grant, so a
-- worker job can put it back once the grant period ends.
--
-- Known, deliberately accepted sharp edge (same one the existing
-- tier-override button already has): subscription_tier is described
-- elsewhere (api/webhooks/stripe/route.ts) as "Stripe is the source of
-- truth... once Checkout has" run — if a profile has a REAL Stripe
-- subscription and Stripe fires a webhook while a free-month grant is
-- active, that webhook will overwrite subscription_tier with Stripe's own
-- view, silently ending the grant early. Not new risk introduced by this
-- migration — the tier-override button already had this exact interaction
-- — but worth knowing if a grant on a paying customer behaves oddly.
alter table profiles add column if not exists subscription_tier_before_grant subscription_tier;
alter table profiles add column if not exists subscription_tier_grant_expires_at timestamptz;

create index idx_profiles_grant_expiry on profiles(subscription_tier_grant_expires_at) where subscription_tier_grant_expires_at is not null;
