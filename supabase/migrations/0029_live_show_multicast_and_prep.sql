-- 28 Aug 2026, Steven, after the live-selling round shipped: "build this
-- multicast now, also need a tool to prepare the show before it goes
-- live like the ability to have the items in the order they want to sell
-- them in and set starting bids... Also set P&P in the items they are
-- selling... needs a design tool so people can design the viewing
-- window, maybe a banner showing the current item and them what's coming
-- up next. Have multiple options."
--
-- Three small additions, all extending migration 0027's live-selling
-- schema rather than replacing anything:
--
-- 1. live_show_multicast_targets — one row per external platform (YouTube/
--    Facebook/Instagram/TikTok/custom) a host wants Cloudflare Stream to
--    simultaneously push their broadcast to (Cloudflare's real "outputs"
--    API — see lib/cloudflareStream.ts). The stream key is a genuine
--    broadcast credential for THAT platform (whoever has it can stream
--    video as the host, same reasoning as live_show_stream_keys) so this
--    table gets the exact same treatment: RLS enabled, ZERO policies —
--    host-only via a service-role-backed API route that checks
--    auth.uid() === host_id in application code, not RLS.
--
-- 2. live_shows.overlay_theme — which of a small set of built-in banner
--    styles (see live/[id]/page.tsx's OVERLAY_THEMES) the "now selling /
--    up next" banner uses. Deliberately a small fixed set of presets
--    rather than a full drag-and-drop design canvas — "have multiple
--    options" read as "let me pick a look," not "build me a design tool
--    from scratch," given the size of everything else in this round.
--
-- 3. live_show_items.shipping_gbp — lets a host set real P&P per item
--    instead of always falling back to the flat courier-based default
--    (lib/orderCreation.ts's existing £4.99 DPD / £2.99 Royal Mail
--    figures) — nullable, so an item with nothing set just keeps using
--    that existing default, no behavior change for anyone who ignores it.

create table live_show_multicast_targets (
  id uuid primary key default gen_random_uuid(),
  live_show_id uuid not null references live_shows(id) on delete cascade,
  platform text not null check (platform in ('youtube', 'facebook', 'instagram', 'tiktok', 'custom')),
  label text,                 -- shown in the host's UI, e.g. a custom platform's name
  rtmp_url text not null,
  stream_key text not null,
  cf_output_id text,          -- Cloudflare's own id for this output, once created there
  created_at timestamptz not null default now(),
  unique (live_show_id, platform)
);

create index idx_live_show_multicast_show on live_show_multicast_targets(live_show_id);

alter table live_show_multicast_targets enable row level security;
-- No policies at all — same established pattern as live_show_stream_keys
-- (0027) and awin_sync_config (0025). Host retrieves/manages via
-- api/live-shows/[id]/multicast, which uses the service-role client and
-- checks auth.uid() === host_id in application code.

alter table live_shows add column if not exists overlay_theme text not null default 'classic'
  check (overlay_theme in ('classic', 'bold', 'minimal'));

alter table live_show_items add column if not exists shipping_gbp numeric check (shipping_gbp is null or shipping_gbp >= 0);

-- ============================================================
-- Seller's own stock (28 Aug 2026, Steven: "need an option in the sellers
-- dashboard to add own stock they have for sale. have a tick box if they
-- want to save it for recurring stock.")
-- ============================================================
--
-- A real, pre-existing gap this surfaced: POST /api/listings has ALWAYS
-- required an opportunityId — there was previously no way for a reseller
-- to list something they sourced themselves, only something Flipsta's own
-- AI discovery found and they won. This table is a seller's own private
-- inventory catalog, independent of the opportunities pipeline; the
-- (relaxed, still backwards-compatible) POST /api/listings can now turn a
-- stock item into a real marketplace listing, which is also how it becomes
-- pickable for a live show (live-show item pickers already just read
-- "my unsold listings" — unchanged, so this plugs straight into the
-- existing live-selling machinery from migration 0027 without touching it).
--
-- is_recurring is informational/filterable in v1 (a "keep this template
-- handy" flag the seller's own stock page can filter/sort on) rather than
-- driving any automatic restock/consume logic — deliberately simple given
-- the size of this round; worth revisiting if sellers want it to actually
-- auto-replenish quantity over time.
create table seller_stock_items (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references profiles(id),
  category_id uuid references categories(id),
  title text not null,
  description text,
  image_url text,
  condition text not null default 'used',
  price_gbp numeric not null check (price_gbp > 0),
  quantity integer not null default 1 check (quantity >= 0),
  is_recurring boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_seller_stock_seller on seller_stock_items(seller_id, created_at desc);

alter table seller_stock_items enable row level security;
create policy "sellers manage their own stock" on seller_stock_items for all using (auth.uid() = seller_id);
