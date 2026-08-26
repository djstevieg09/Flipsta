-- 0019: admin AI-focus control + seasonal awareness (full calendar option).
--
-- 26 Aug 2026, Steven: "in the admin dashboard i need to be able to chosse
-- what the AI should focus on when finding deals" + "The Ai bot needs to be
-- learning what its already found and not search over old ground. also
-- look at the time of year and think for instance Halloween coming up then
-- start looking for Halloween goods... Also needs to remove Halloween
-- stuff after its past and then start looking for the next big holiday."
-- Confirmed via a clarifying question: "Full calendar" — season-aware
-- search + auto-expiry + an admin page to edit the calendar, not hardcoded.

-- Per-category steering: pause a category the AI keeps rotating through
-- for no reason, or leave a short note pushing it toward something
-- specific ("push Halloween costumes" etc — though the dated seasonal
-- table below is the more precise tool for that particular case). One row
-- per category, upserted from the admin page — no row yet for a category
-- just means "active, no note", so this table only needs to hold
-- exceptions, not a mandatory row per category.
create table discovery_focus (
  id uuid primary key default gen_random_uuid(),
  category_slug text not null unique references categories(slug),
  status text not null default 'active' check (status in ('active', 'paused')),
  focus_note text,
  updated_at timestamptz not null default now()
);

-- The seasonal calendar itself. search_starts_on/search_ends_on is the
-- window claudeSearchAdapter.ts actively steers toward this event within;
-- expire_stock_after is when shop_items tagged to this event (see
-- shop_items.seasonal_event_id below) get automatically hidden — kept as
-- its own separate date rather than reusing search_ends_on, since Steven
-- may reasonably want unsold Halloween stock cleared a few days after
-- Halloween itself, not the instant the search window ends.
create table seasonal_events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- Free-form array of categories.slug values rather than a join table —
  -- simple to edit from one admin form, and the values only ever need to
  -- match what claudeSearchAdapter.ts's VALID_CATEGORY_SLUGS already knows
  -- about, not their own referential integrity.
  category_slugs text[] not null default '{}',
  search_starts_on date not null,
  search_ends_on date not null,
  expire_stock_after date not null,
  created_at timestamptz not null default now()
);

create index idx_seasonal_events_window on seasonal_events(search_starts_on, search_ends_on);

-- Tags a shop item as belonging to a seasonal event, so
-- expireSeasonalStock.ts (apps/worker) knows what to hide once its window
-- passes. Only on shop_items, not opportunities — an opportunity already
-- expires on its own short action clock (Section 11.1) and gets relisted
-- or dropped well before a season turns over, so there's nothing here for
-- it to leak past.
alter table shop_items add column if not exists seasonal_event_id uuid references seasonal_events(id);

alter table discovery_focus enable row level security;
alter table seasonal_events enable row level security;

-- Staff-only, same pattern as partners/risk_flags/admin_audit_log in
-- 0002_admin_ops.sql: RLS is on, but deliberately no policy is granted to
-- the "authenticated" role, so only the service-role client (used by the
-- admin API routes, after requireStaff() checks the caller's role in the
-- application layer) can read or write these two tables at all.
